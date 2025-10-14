import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';

import type { Team, TeamMember, TeamMemberRole } from '../api/teams';
import { removeTeamMember, teamsQueryKey, updateTeamMemberRole } from '../api/teams';

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_ORDER: TeamMemberRole[] = ['viewer', 'editor', 'admin'];

const isDowngrade = (current: TeamMemberRole, next: TeamMemberRole) => {
  const currentRank = ROLE_ORDER.indexOf(current);
  const nextRank = ROLE_ORDER.indexOf(next);

  if (currentRank === -1 || nextRank === -1) {
    return false;
  }

  return nextRank < currentRank;
};

type TeamMemberActionsProps = {
  teamId: string;
  teamName: string;
  member: TeamMember;
  currentUserId: string;
  currentUserRole: TeamMemberRole | null;
};

type MutationContext = {
  previousTeams: Team[] | undefined;
};

export const TeamMemberActions: React.FC<TeamMemberActionsProps> = ({
  teamId,
  teamName,
  member,
  currentUserId,
  currentUserRole,
}) => {
  const selectId = React.useId();
  const queryClient = useQueryClient();
  const queryKey = teamsQueryKey(currentUserId);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);

  const isSelf = member.user?.id === currentUserId;
  const isAdmin = currentUserRole === 'admin';
  const canEditRoles = isAdmin;
  const canRemoveMember = isAdmin || isSelf;

  const updateRoleMutation = useMutation<void, Error, TeamMemberRole, MutationContext>({
    mutationFn: (role) => updateTeamMemberRole({ teamId, memberId: member.id, role }),
    onMutate: async (nextRole) => {
      await queryClient.cancelQueries({ queryKey });

      const previousTeams = queryClient.getQueryData<Team[]>(queryKey);

      queryClient.setQueryData<Team[]>(queryKey, (old) => {
        if (!old) {
          return old;
        }

        return old.map((team) => {
          if (team.id !== teamId) {
            return team;
          }

          return {
            ...team,
            members: team.members.map((existingMember) =>
              existingMember.id === member.id
                ? { ...existingMember, role: nextRole }
                : existingMember,
            ),
          };
        });
      });

      return { previousTeams };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTeams) {
        queryClient.setQueryData(queryKey, context.previousTeams);
      }

      toast({
        title: 'Failed to update role',
        description: 'Please try again.',
      });
    },
    onSuccess: (_result, nextRole) => {
      const roleLabel = ROLE_LABELS[nextRole] ?? nextRole;
      toast({
        title: 'Role updated',
        description: roleLabel,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMemberMutation = useMutation<void, Error, void, MutationContext>({
    mutationFn: () => removeTeamMember({ teamId, memberId: member.id }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });

      const previousTeams = queryClient.getQueryData<Team[]>(queryKey);

      queryClient.setQueryData<Team[]>(queryKey, (old) => {
        if (!old) {
          return old;
        }

        return old.map((team) => {
          if (team.id !== teamId) {
            return team;
          }

          return {
            ...team,
            members: team.members.filter((existingMember) => existingMember.id !== member.id),
          };
        });
      });

      return { previousTeams };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTeams) {
        queryClient.setQueryData(queryKey, context.previousTeams);
      }

      toast({
        title: 'Failed to update membership',
        description: 'Please try again.',
      });
    },
    onSuccess: () => {
      if (isSelf) {
        toast({
          title: 'Left team',
          description: `You have left ${teamName}.`,
        });
      } else {
        toast({
          title: 'Member removed',
          description: `${member.user?.name ?? 'Team member'} no longer has access.`,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const isBusy = updateRoleMutation.isPending || removeMemberMutation.isPending;

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.target.value as TeamMemberRole;

    if (nextRole === member.role) {
      return;
    }

    updateRoleMutation.mutate(nextRole);
  };

  const handleRemove = () => {
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmRemove = () => {
    setIsConfirmDialogOpen(false);
    removeMemberMutation.mutate();
  };

  const roleOptions = React.useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
        disabled: isSelf && isDowngrade(member.role, role),
      })),
    [isSelf, member.role],
  );

  const removeLabel = isSelf ? 'Leave team' : 'Remove member';
  const confirmTitle = isSelf ? 'Leave team' : 'Remove member';
  const memberName = member.user?.name ?? 'this member';
  const confirmDescription = isSelf
    ? `Are you sure you want to leave ${teamName}?`
    : `Remove ${memberName} from ${teamName}?`;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
      {canEditRoles ? (
        <div className="flex flex-col gap-1 text-left sm:text-right">
          <label htmlFor={selectId} className="sr-only">
            Role
          </label>
          <select
            id={selectId}
            aria-label="Role"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={member.role}
            onChange={handleRoleChange}
            disabled={isBusy}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
          {ROLE_LABELS[member.role] ?? member.role}
        </span>
      )}
      {canRemoveMember ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={isBusy}
          >
            {removeLabel}
          </Button>
          <ConfirmDialog
            open={isConfirmDialogOpen}
            onOpenChange={setIsConfirmDialogOpen}
            title={confirmTitle}
            description={confirmDescription}
            confirmLabel={removeLabel}
            cancelLabel="Cancel"
            isConfirming={removeMemberMutation.isPending}
            onConfirm={handleConfirmRemove}
          />
        </>
      ) : null}
    </div>
  );
};
