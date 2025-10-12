import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchPlanLimits,
  planLimitsQueryKey,
} from '@/domains/prompts/api/planLimits';
import {
  evaluateIntegerPlanLimit,
  PlanLimitError,
  type IntegerPlanLimitEvaluation,
} from '@/lib/limits';
import {
  inviteTeamMember,
  TeamInviteUserNotFoundError,
  teamsQueryKey,
  type Team,
} from '../api/teams';

const MEMBERS_PER_TEAM_LIMIT_KEY = 'members_per_team';

const baseSchema = z.object({
  email: z
    .string({ required_error: 'Email is required.' })
    .min(1, 'Email is required.')
    .email('Enter a valid email address.')
    .transform((value) => value.trim().toLowerCase()),
});

type TeamInviteFormValues = z.infer<typeof baseSchema>;

const DEFAULT_VALUES: TeamInviteFormValues = {
  email: '',
};

type InviteVariables = {
  email: string;
};

type TeamInviteFormProps = {
  team: Team;
  currentUserId: string;
};

const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const formatLimitMessage = ({
  planId,
  isLoading,
  isError,
  errorMessage,
  evaluation,
  currentMembers,
}: {
  planId: string | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  evaluation: IntegerPlanLimitEvaluation | null;
  currentMembers: number;
}) => {
  if (!planId) {
    return 'Plan information is unavailable for this team. Invites may be restricted.';
  }

  if (isLoading) {
    return 'Checking plan capacity…';
  }

  if (isError) {
    const baseMessage = 'Failed to load plan limits. Invites may be restricted.';
    return errorMessage ? `${baseMessage} ${errorMessage}` : baseMessage;
  }

  if (!evaluation) {
    return 'Plan limit data is unavailable. Invites may be restricted until the limit is confirmed.';
  }

  if (evaluation.status === 'missing-limit') {
    return 'This plan does not define a member limit. Contact support to confirm upgrade options before inviting more teammates.';
  }

  if (evaluation.limitValue === null) {
    return `This team currently has ${currentMembers.toLocaleString()} ${pluralize(currentMembers, 'member', 'members')}. Your plan allows unlimited members.`;
  }

  if (!evaluation.allowed) {
    return `This team has reached the limit of ${evaluation.limitValue.toLocaleString()} ${pluralize(
      evaluation.limitValue,
      'member',
      'members',
    )}. Remove members or upgrade the plan to invite more.`;
  }

  if (evaluation.status === 'limit-reached') {
    return `Inviting one more teammate will use the remaining seat on your plan (${evaluation.limitValue.toLocaleString()} total).`;
  }

  return `This team is using ${currentMembers.toLocaleString()} of ${evaluation.limitValue.toLocaleString()} ${pluralize(
    evaluation.limitValue,
    'member seat',
    'member seats',
  )}.`;
};

const formatUpgradeMessage = (evaluation: IntegerPlanLimitEvaluation | null) => {
  if (!evaluation) {
    return 'Upgrade your plan to unlock more seats for your team.';
  }

  if (evaluation.limitValue === null) {
    return 'Consider upgrading your plan to unlock additional team features.';
  }

  if (!evaluation.allowed) {
    return `You have used all ${evaluation.limitValue.toLocaleString()} seats on this plan. Remove members or upgrade to add more.`;
  }

  if (evaluation.status === 'limit-reached') {
    return `Adding one more teammate will consume the final seat (${evaluation.limitValue.toLocaleString()} total). Upgrading ensures continued growth.`;
  }

  return `You are using ${evaluation.currentUsage.toLocaleString()} of ${evaluation.limitValue.toLocaleString()} seats. Upgrade to increase the limit.`;
};

export const TeamInviteForm: React.FC<TeamInviteFormProps> = ({ team, currentUserId }) => {
  const queryClient = useQueryClient();
  const inputId = React.useId();
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);

  const existingEmails = React.useMemo(() => {
    const entries = team.members
      .map((member) => member.user?.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));

    return new Set(entries);
  }, [team.members]);

  const schema = React.useMemo(
    () =>
      baseSchema.superRefine((values, ctx) => {
        if (existingEmails.has(values.email)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['email'],
            message: 'This user is already a member of the team.',
          });
        }
      }),
    [existingEmails],
  );

  const resolver = React.useMemo(() => zodResolver(schema), [schema]);

  const form = useForm<TeamInviteFormValues>({
    defaultValues: DEFAULT_VALUES,
    resolver,
  });

  React.useEffect(() => {
    void form.trigger('email');
  }, [schema, form]);

  React.useEffect(() => {
    setLastEvaluation(null);
  }, [team.members.length]);

  const planLimitsQueryKeyValue = React.useMemo(
    () => (team.planId ? planLimitsQueryKey(team.planId) : ['plan-limits', 'unknown-plan'] as const),
    [team.planId],
  );

  const planLimitsQuery = useQuery({
    queryKey: planLimitsQueryKeyValue,
    queryFn: () =>
      team.planId
        ? fetchPlanLimits({ planId: team.planId })
        : Promise.reject(new Error('Plan identifier is required to load limits.')),
    enabled: Boolean(team.planId),
    staleTime: 5 * 60 * 1000,
  });

  const planLimits = planLimitsQuery.data ?? null;
  const isPlanLimitsLoading = planLimitsQuery.status === 'pending';
  const planLimitsError = planLimitsQuery.status === 'error';
  const planLimitsErrorMessage = planLimitsError
    ? planLimitsQuery.error instanceof Error
      ? planLimitsQuery.error.message
      : 'Please try again later.'
    : null;

  const evaluation = React.useMemo(() => {
    if (!planLimits) {
      return null;
    }

    return evaluateIntegerPlanLimit({
      limits: planLimits,
      key: MEMBERS_PER_TEAM_LIMIT_KEY,
      currentUsage: team.members.length,
      delta: 1,
    });
  }, [planLimits, team.members.length]);

  const activeEvaluation = lastEvaluation ?? evaluation;
  const shouldShowUpgradeNotice = activeEvaluation?.shouldRecommendUpgrade ?? false;
  const isAtCapacity = Boolean(activeEvaluation && !activeEvaluation.allowed);

  const inviteMutation = useMutation({
    mutationFn: async ({ email }: InviteVariables) =>
      inviteTeamMember({ teamId: team.id, email, role: 'viewer' }),
    onSuccess: (member, variables) => {
      form.reset(DEFAULT_VALUES);
      toast({
        title: 'Member invited',
        description: `Invitation sent to ${
          member.user?.name?.trim().length
            ? member.user.name
            : member.user?.email ?? variables.email
        }.`,
      });
      void queryClient.invalidateQueries({ queryKey: teamsQueryKey(currentUserId) });
      setUpgradeOpen(false);
      setLastEvaluation(null);
    },
    onError: (error: unknown) => {
      if (error instanceof TeamInviteUserNotFoundError) {
        form.setError('email', {
          type: 'manual',
          message: 'No user with that email was found. Ask them to sign up first.',
        });
        return;
      }

      if (error instanceof PlanLimitError) {
        setLastEvaluation(error.evaluation);
        setUpgradeOpen(true);
        form.setError('root', {
          type: 'manual',
          message:
            'This team has reached its member limit. Remove members or upgrade the plan to continue inviting.',
        });
        return;
      }

      const fallbackMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to send invitation. Please try again.';

      form.setError('root', {
        type: 'manual',
        message: fallbackMessage,
      });
      console.error(error);
    },
  });

  const isSubmitting = inviteMutation.isPending;
  const isSubmitDisabled = isSubmitting || isAtCapacity;

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    const normalizedEmail = values.email;

    if (existingEmails.has(normalizedEmail)) {
      form.setError('email', {
        type: 'manual',
        message: 'This user is already a member of the team.',
      });
      return;
    }

    inviteMutation.mutate({
      email: normalizedEmail,
    });
  });

  const limitMessage = React.useMemo(
    () =>
      formatLimitMessage({
        planId: team.planId,
        isLoading: isPlanLimitsLoading,
        isError: planLimitsError,
        errorMessage: planLimitsErrorMessage,
        evaluation,
        currentMembers: team.members.length,
      }),
    [
      team.planId,
      isPlanLimitsLoading,
      planLimitsError,
      planLimitsErrorMessage,
      evaluation,
      team.members.length,
    ],
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">Invite members</h3>
        <p className="text-sm text-muted-foreground">
          Add teammates by email. New members join as viewers and can be promoted later.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{limitMessage}</p>

      {shouldShowUpgradeNotice ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{formatUpgradeMessage(activeEvaluation ?? null)}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setUpgradeOpen(true)}
            className="border-amber-200 text-amber-900 hover:bg-amber-100"
          >
            Review upgrade options
          </Button>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={inputId}>
            Email address
          </label>
          <Input
            id={inputId}
            type="email"
            placeholder="teammate@example.com"
            autoComplete="email"
            {...form.register('email')}
            disabled={isSubmitting || isAtCapacity}
            aria-describedby={form.formState.errors.email ? `${inputId}-error` : undefined}
          />
          {form.formState.errors.email ? (
            <p id={`${inputId}-error`} className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>

        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        ) : null}

        <Button type="submit" disabled={isSubmitDisabled} className="w-full sm:w-auto">
          {isSubmitting ? 'Sending invite…' : 'Send invite'}
        </Button>
      </form>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        evaluation={activeEvaluation ?? null}
      />
    </div>
  );
};
