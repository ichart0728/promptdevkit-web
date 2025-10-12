import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

const showAlert = (message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(message);
  }
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

      showAlert('Failed to update team member role. Please try again.');
    },
    onSuccess: (_result, nextRole) => {
      const roleLabel = ROLE_LABELS[nextRole] ?? nextRole;
      showAlert(`Role updated to ${roleLabel}.`);
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

      showAlert('Failed to update team membership. Please try again.');
    },
    onSuccess: () => {
      if (isSelf) {
        showAlert(`You have left ${teamName}.`);
      } else {
        showAlert('Member removed from the team.');
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
    const memberName = member.user?.name ?? 'this member';
    const confirmationMessage = isSelf
      ? `Are you sure you want to leave ${teamName}?`
      : `Remove ${memberName} from ${teamName}?`;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(confirmationMessage);

      if (!confirmed) {
        return;
      }
    }

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
        <Button
          variant="outline"
          size="sm"
          onClick={handleRemove}
          disabled={isBusy}
        >
          {removeLabel}
        </Button>
      ) : null}
    </div>
  );
};
