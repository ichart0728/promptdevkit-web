import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { workspaceUsageQueryOptions, type WorkspaceUsage } from '../api/metrics';
import { fetchPlanLimits, planLimitsQueryKey } from '@/domains/prompts/api/planLimits';
import type { PlanLimitMap } from '@/lib/limits';

const formatLatestUpdatedAt = (isoString: string | null) => {
  if (!isoString) {
    return 'No updates yet';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return 'No updates yet';
  }

  return `Last updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
};

const SkeletonCard = () => (
  <div
    data-testid="workspace-usage-card-skeleton"
    className="rounded-lg border bg-card p-6 shadow-sm"
  >
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  </div>
);

type PlanLimitQueryMap = Map<string, UseQueryResult<PlanLimitMap, unknown>>;

const UsageCards = ({ usage, planLimitQueries }: { usage: WorkspaceUsage[]; planLimitQueries: PlanLimitQueryMap }) => {
  if (usage.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No prompts yet. Create your first prompt to see usage here.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {usage.map((workspace) => {
        const promptLabel = workspace.promptCount === 1 ? 'prompt' : 'prompts';
        const latestUpdate = formatLatestUpdatedAt(workspace.latestUpdatedAt);
        const planLimitQuery = workspace.planId ? planLimitQueries.get(workspace.planId) ?? null : null;

        return (
          <article
            key={workspace.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm"
            aria-label={`${workspace.name} prompt usage`}
          >
            <div className="space-y-4 p-6">
              <header className="space-y-1">
                <h3 className="text-lg font-semibold">{workspace.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {workspace.promptCount} {promptLabel}
                </p>
              </header>
              <PlanUsageStatus workspace={workspace} planLimitQuery={planLimitQuery} />
              <p className="text-sm text-muted-foreground">{latestUpdate}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
};

const PlanUsageStatus = ({
  workspace,
  planLimitQuery,
}: {
  workspace: WorkspaceUsage;
  planLimitQuery: UseQueryResult<PlanLimitMap, unknown> | null;
}) => {
  if (!workspace.planLimitKey) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-fallback-${workspace.id}`}>
        Plan usage details are not available for this workspace.
      </p>
    );
  }

  if (!workspace.planId) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-missing-${workspace.id}`}>
        Plan information is unavailable.
      </p>
    );
  }

  if (!planLimitQuery || planLimitQuery.status === 'pending') {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-loading-${workspace.id}`}>
        Loading plan limits…
      </p>
    );
  }

  if (planLimitQuery.status === 'error') {
    const errorMessage =
      planLimitQuery.error instanceof Error
        ? planLimitQuery.error.message
        : 'Please try again later.';

    return (
      <p className="text-xs text-destructive" data-testid={`workspace-plan-error-${workspace.id}`}>
        Failed to load plan limits. {errorMessage}
      </p>
    );
  }

  const planLimits = planLimitQuery.data ?? null;

  if (!planLimits) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-unavailable-${workspace.id}`}>
        Plan limits are not configured yet.
      </p>
    );
  }

  const limitRecord = planLimits[workspace.planLimitKey] ?? null;

  if (!limitRecord) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-unconfigured-${workspace.id}`}>
        Plan limits are not configured yet.
      </p>
    );
  }

  if (limitRecord.value_int === null || typeof limitRecord.value_int === 'undefined') {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`workspace-plan-unlimited-${workspace.id}`}>
        Unlimited prompts available.
      </p>
    );
  }

  const limitValue = limitRecord.value_int;
  const used = workspace.promptCount;
  const remaining = Math.max(limitValue - used, 0);
  const progress = limitValue > 0 ? Math.min((used / limitValue) * 100, 100) : used > 0 ? 100 : 0;
  const clampedValue = Math.min(used, limitValue);

  return (
    <div className="space-y-2" data-testid={`workspace-plan-progress-${workspace.id}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Plan usage</span>
        <span>
          {used} / {limitValue} prompts
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Prompt usage"
        aria-valuemin={0}
        aria-valuemax={limitValue}
        aria-valuenow={clampedValue}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{remaining} prompts remaining</p>
    </div>
  );
};

export const WorkspaceUsageCards = () => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;

  const usageQuery = useQuery({
    ...workspaceUsageQueryOptions(userId),
    enabled: !!userId,
  });

  const planAwareUsage = useMemo(() => usageQuery.data ?? [], [usageQuery.data]);

  const planIds = useMemo(() => {
    const ids = planAwareUsage
      .map((workspace) => workspace.planId)
      .filter((planId): planId is string => Boolean(planId));

    return Array.from(new Set(ids));
  }, [planAwareUsage]);

  const planLimitQueryConfigs = useMemo(
    () =>
      planIds.map((planId) => ({
        queryKey: planLimitsQueryKey(planId),
        queryFn: () => fetchPlanLimits({ planId }),
        staleTime: 5 * 60 * 1000,
        enabled: true,
      })),
    [planIds],
  );

  const planLimitQueries = useQueries({
    queries: planLimitQueryConfigs,
  }) as UseQueryResult<PlanLimitMap, unknown>[];

  const planLimitQueriesByPlanId = useMemo(() => {
    return planIds.reduce<PlanLimitQueryMap>((acc, planId, index) => {
      const query = planLimitQueries[index];

      if (query) {
        acc.set(planId, query);
      }

      return acc;
    }, new Map());
  }, [planIds, planLimitQueries]);

  const sectionDescription = 'Track prompt volume and recent updates across your workspaces.';

  let content: ReactNode;

  if (sessionQuery.status === 'pending') {
    content = (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  } else if (!userId) {
    content = (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sign in to view prompt activity across your workspaces.
      </div>
    );
  } else if (usageQuery.status === 'pending') {
    content = (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  } else if (usageQuery.status === 'error') {
    const errorMessage =
      usageQuery.error instanceof Error ? usageQuery.error.message : 'Please try again later.';

    content = (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load workspace usage. {errorMessage}
      </div>
    );
  } else {
    content = <UsageCards usage={planAwareUsage} planLimitQueries={planLimitQueriesByPlanId} />;
  }

  return (
    <section aria-label="Workspace prompt usage" className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Workspace prompt usage</h2>
        <p className="text-sm text-muted-foreground">{sectionDescription}</p>
      </div>
      {content}
    </section>
  );
};
