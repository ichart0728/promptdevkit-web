import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import { Button } from '@/components/ui/button';
import {
  fetchPlanLimits,
  planLimitsQueryKey,
} from '@/domains/prompts/api/planLimits';
import { evaluateIntegerPlanLimit } from '@/lib/limits';

import { type Team } from '../api/teams';
import {
  formatTeamLimitMessage,
  formatTeamUpgradeMessage,
  getTeamSeatUsageStatus,
  MEMBERS_PER_TEAM_LIMIT_KEY,
  type TeamSeatUsageStatus,
} from '../utils/planLimitMessaging';

const STATUS_STYLES: Record<TeamSeatUsageStatus, string> = {
  'at-capacity': 'border-destructive/40 bg-destructive/10 text-destructive',
  'last-seat': 'border-amber-200 bg-amber-50 text-amber-900',
  available: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
  loading: 'border-muted bg-muted/20 text-muted-foreground',
  unavailable: 'border-muted bg-muted/20 text-muted-foreground',
};

const STATUS_LABELS: Record<TeamSeatUsageStatus, string> = {
  'at-capacity': 'No seats remaining',
  'last-seat': 'Final seat available',
  available: 'Seats available',
  error: 'Plan limits unavailable',
  loading: 'Checking seats…',
  unavailable: 'Plan details unavailable',
};

type TeamPlanUsageBannerProps = {
  team: Team;
  planLabel: string;
};

export const TeamPlanUsageBanner: React.FC<TeamPlanUsageBannerProps> = ({ team, planLabel }) => {
  const [isUpgradeOpen, setIsUpgradeOpen] = React.useState(false);

  const planLimitsQuery = useQuery({
    queryKey: team.planId
      ? planLimitsQueryKey(team.planId)
      : ['plan-limits', 'unknown-plan'] as const,
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

  const seatStatus = getTeamSeatUsageStatus({
    planId: team.planId,
    isLoading: isPlanLimitsLoading,
    isError: planLimitsError,
    evaluation,
  });

  const limitMessage = formatTeamLimitMessage({
    planId: team.planId,
    isLoading: isPlanLimitsLoading,
    isError: planLimitsError,
    errorMessage: planLimitsErrorMessage,
    evaluation,
    currentMembers: team.members.length,
  });

  const shouldRecommendUpgrade = evaluation?.shouldRecommendUpgrade ?? false;
  const upgradeMessage = formatTeamUpgradeMessage(evaluation ?? null);

  const statusClassName = STATUS_STYLES[seatStatus];
  const statusLabel = STATUS_LABELS[seatStatus];
  const upgradeButtonClassName =
    seatStatus === 'at-capacity'
      ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
      : 'border-amber-200 text-amber-900 hover:bg-amber-100';

  return (
    <div
      className={`space-y-2 rounded-md border p-4 text-sm ${statusClassName}`}
      data-seat-status={seatStatus}
      data-testid="team-plan-usage-banner"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{statusLabel}</p>
        <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
          {team.planId ? `Plan: ${planLabel}` : 'No linked plan'}
        </p>
      </div>
      <p>{limitMessage}</p>
      {shouldRecommendUpgrade ? (
        <div className="flex flex-col gap-2 rounded-md border border-current/30 bg-background/60 p-3 text-sm">
          <p>{upgradeMessage}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsUpgradeOpen(true)}
            className={`self-start ${upgradeButtonClassName}`}
          >
            Review upgrade options
          </Button>
        </div>
      ) : null}
      <UpgradeDialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen} evaluation={evaluation ?? null} />
    </div>
  );
};
