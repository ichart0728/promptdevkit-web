import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { teamsQueryOptions } from '@/domains/teams/api/teams';
import {
  fetchPlanLimits,
  fetchUserPlanId,
  planLimitsQueryKey,
  userPlanQueryKey,
} from '@/domains/prompts/api/planLimits';
import {
  evaluateIntegerPlanLimit,
  type IntegerPlanLimitEvaluation,
  type PlanLimitMap,
} from '@/lib/limits';

import { createWorkspace, workspacesQueryKey } from '../api/workspaces';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { createWorkspaceSchema, type CreateWorkspaceFormValues } from '../forms/createWorkspaceSchema';

const PERSONAL_WORKSPACES_LIMIT_KEY = 'personal_workspaces';
const TEAM_WORKSPACES_LIMIT_KEY = 'team_workspaces';

const LIMIT_KEY_BY_TYPE: Record<CreateWorkspaceFormValues['type'], string> = {
  personal: PERSONAL_WORKSPACES_LIMIT_KEY,
  team: TEAM_WORKSPACES_LIMIT_KEY,
};

const DEFAULT_FORM_VALUES: CreateWorkspaceFormValues = {
  name: '',
  type: 'personal',
  teamId: '',
};

const formatLimitLabel = ({
  planLimits,
  limitKey,
  currentUsage,
  type,
}: {
  planLimits: PlanLimitMap | undefined;
  limitKey: string;
  currentUsage: number;
  type: CreateWorkspaceFormValues['type'];
}) => {
  const limitRecord = planLimits?.[limitKey] ?? null;

  if (!limitRecord) {
    return `Plan limit for ${type === 'team' ? 'team' : 'personal'} workspaces is unavailable.`;
  }

  if (limitRecord.value_int === null || typeof limitRecord.value_int === 'undefined') {
    return 'Unlimited workspaces on your current plan.';
  }

  return `${currentUsage.toLocaleString()} of ${limitRecord.value_int.toLocaleString()} ${
    type === 'team' ? 'team' : 'personal'
  } workspaces used.`;
};

export const CreateWorkspaceDialog = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const {
    hasSession,
    workspaces,
    refetch,
    setActiveWorkspaceId,
  } = useWorkspaceContext();

  const userId = sessionQuery.data?.user?.id ?? null;
  const [open, setOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);

  const form = useForm<CreateWorkspaceFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    resolver: zodResolver(createWorkspaceSchema),
  });

  const selectedType = form.watch('type');

  React.useEffect(() => {
    if (selectedType === 'personal') {
      form.setValue('teamId', '');
      form.clearErrors('teamId');
    }
  }, [selectedType, form]);

  const personalWorkspaceCount = React.useMemo(
    () => workspaces.filter((workspace) => workspace.type === 'personal').length,
    [workspaces],
  );
  const teamWorkspaceCount = React.useMemo(
    () => workspaces.filter((workspace) => workspace.type === 'team').length,
    [workspaces],
  );

  const userPlanQuery = useQuery({
    queryKey: userPlanQueryKey(userId ?? null),
    queryFn: () =>
      userId
        ? fetchUserPlanId({ userId })
        : Promise.reject(new Error('Cannot determine plan without a user.')),
    enabled: open && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const planId = userPlanQuery.data ?? null;
  const isPlanLookupLoading = userPlanQuery.status === 'pending';
  const planLookupError = userPlanQuery.status === 'error';
  const planLookupErrorMessage = planLookupError ? userPlanQuery.error?.message ?? null : null;

  const planLimitsQuery = useQuery({
    queryKey: planId ? planLimitsQueryKey(planId) : (['plan-limits', 'unknown-plan'] as const),
    queryFn: () =>
      planId
        ? fetchPlanLimits({ planId })
        : Promise.reject(new Error('Plan identifier required to load limits.')),
    enabled: open && !!planId,
    staleTime: 5 * 60 * 1000,
  });

  const planLimits = planLimitsQuery.data;
  const isPlanLimitsLoading = planLimitsQuery.status === 'pending';
  const planLimitsError = planLimitsQuery.status === 'error';

  const teamsQuery = useQuery({
    ...teamsQueryOptions(userId ?? null),
    enabled: open && !!userId,
    staleTime: 60 * 1000,
  });

  const isTeamsLoading = teamsQuery.status === 'pending';
  const teamsError = teamsQuery.status === 'error';
  const teamsErrorMessage = teamsError ? teamsQuery.error?.message ?? 'Failed to load teams.' : null;

  const adminTeams = React.useMemo(() => {
    if (!teamsQuery.data || !userId) {
      return [];
    }

    return teamsQuery.data.filter((team) =>
      team.members.some((member) => member.user?.id === userId && member.role === 'admin'),
    );
  }, [teamsQuery.data, userId]);

  const canCreateTeamWorkspace = adminTeams.length > 0;
  const limitKey = LIMIT_KEY_BY_TYPE[selectedType];
  const currentUsage = selectedType === 'team' ? teamWorkspaceCount : personalWorkspaceCount;
  const planLimitLabel = formatLimitLabel({
    planLimits,
    limitKey,
    currentUsage,
    type: selectedType,
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: createWorkspace,
  });

  const resetFormState = React.useCallback(() => {
    form.reset(DEFAULT_FORM_VALUES);
    form.clearErrors();
    setLastEvaluation(null);
  }, [form]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetFormState();
      setUpgradeOpen(false);
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    if (!userId) {
      form.setError('root', { type: 'manual', message: 'You must be signed in to create a workspace.' });
      return;
    }

    if (isPlanLookupLoading || isPlanLimitsLoading) {
      form.setError('root', {
        type: 'manual',
        message: 'Plan information is still loading. Please wait a moment and try again.',
      });
      return;
    }

    if (planLookupError) {
      form.setError('root', {
        type: 'manual',
        message: planLookupErrorMessage ?? 'Failed to determine your current plan. Please retry.',
      });
      return;
    }

    if (planLimitsError || !planLimits) {
      form.setError('root', {
        type: 'manual',
        message: 'Plan limits are unavailable. Please try again after reloading the page.',
      });
      return;
    }

    if (values.type === 'team' && !canCreateTeamWorkspace) {
      form.setError('root', {
        type: 'manual',
        message: 'You need to be an admin of a team before creating a team workspace.',
      });
      return;
    }

    const evaluation = evaluateIntegerPlanLimit({
      limits: planLimits,
      key: LIMIT_KEY_BY_TYPE[values.type],
      currentUsage: values.type === 'team' ? teamWorkspaceCount : personalWorkspaceCount,
    });

    setLastEvaluation(evaluation);

    if (!evaluation.allowed) {
      setUpgradeOpen(true);
      return;
    }

    try {
      const workspace = await createWorkspaceMutation.mutateAsync({
        name: values.name,
        type: values.type,
        teamId: values.type === 'team' ? values.teamId ?? null : null,
      });

      await queryClient.invalidateQueries({ queryKey: workspacesQueryKey(userId) });

      try {
        await refetch();
      } catch (refetchError) {
        const message =
          refetchError instanceof Error
            ? refetchError.message
            : 'Workspace created, but failed to refresh the workspace list. Please reload the page.';
        form.setError('root', { type: 'manual', message });
        return;
      }

      setActiveWorkspaceId(workspace.id);
      handleOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create the workspace. Please try again.';
      form.setError('root', { type: 'manual', message });
    }
  });

  const isCreating = createWorkspaceMutation.status === 'pending';
  const isSubmitDisabled =
    !userId ||
    isCreating ||
    isPlanLookupLoading ||
    planLookupError ||
    isPlanLimitsLoading ||
    planLimitsError ||
    (selectedType === 'team' && (isTeamsLoading || teamsError || !canCreateTeamWorkspace));

  if (!hasSession) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            New workspace
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new workspace</DialogTitle>
            <DialogDescription>
              Workspaces group prompts, templates, and settings. Choose the right type for your workflow.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workspace-name">
                Workspace name
              </label>
              <Input
                id="workspace-name"
                placeholder="My first workspace"
                {...form.register('name')}
                disabled={isCreating}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Workspace type</legend>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium">
                  <input
                    type="radio"
                    value="personal"
                    {...form.register('type')}
                    disabled={isCreating}
                  />
                  Personal workspace
                </label>
                <label className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium">
                  <input
                    type="radio"
                    value="team"
                    {...form.register('type')}
                    disabled={isCreating || (!isTeamsLoading && !canCreateTeamWorkspace)}
                  />
                  Team workspace
                </label>
              </div>
              {selectedType === 'team' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="workspace-team">
                    Team
                  </label>
                  <select
                    id="workspace-team"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    {...form.register('teamId')}
                    disabled={isCreating || isTeamsLoading || teamsError}
                  >
                    <option value="">Select a team</option>
                    {adminTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  {isTeamsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading teams…</p>
                  ) : teamsError ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                      <span>{teamsErrorMessage}</span>
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => {
                          void teamsQuery.refetch();
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : !canCreateTeamWorkspace ? (
                    <p className="text-xs text-muted-foreground">
                      You need to be an admin of a team to create a team workspace.
                    </p>
                  ) : null}
                  {form.formState.errors.teamId ? (
                    <p className="text-xs text-destructive">{form.formState.errors.teamId.message}</p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{planLimitLabel}</span>
              {lastEvaluation && lastEvaluation.shouldRecommendUpgrade ? (
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => setUpgradeOpen(true)}
                >
                  Why upgrade?
                </button>
              ) : null}
            </div>

            {planLookupError ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                <span>
                  Failed to load your plan. {planLookupErrorMessage ?? 'Please try again.'}
                </span>
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    void userPlanQuery.refetch();
                  }}
                  disabled={isPlanLookupLoading}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {planLimitsError ? (
              <p className="text-xs text-destructive">Failed to load plan limits. Please try again.</p>
            ) : null}

            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitDisabled}>
                {isCreating ? 'Creating…' : 'Create workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        evaluation={lastEvaluation}
        onResetEvaluation={() => setLastEvaluation(null)}
      />
    </>
  );
};
