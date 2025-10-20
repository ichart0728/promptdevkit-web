import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import {
  workspacePromptActivityQueryOptions,
  type WorkspacePromptActivity,
} from '../api/promptActivity';

const formatDateForDisplay = (isoDate: string) => {
  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
};

type DailyTotal = {
  date: string;
  formattedDate: string;
  totalCount: number;
};

const computeDailyTotals = (activity: WorkspacePromptActivity[]): DailyTotal[] => {
  const totals = new Map<string, number>();

  for (const item of activity) {
    const current = totals.get(item.activityDate) ?? 0;
    totals.set(item.activityDate, current + item.promptUpdateCount);
  }

  return Array.from(totals.entries())
    .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
    .map(([date, totalCount]) => ({
      date,
      formattedDate: formatDateForDisplay(date),
      totalCount,
    }));
};

const ActivityChart = ({ totals }: { totals: DailyTotal[] }) => {
  if (totals.length === 0) {
    return null;
  }

  const maxCount = Math.max(...totals.map((point) => point.totalCount), 1);

  const dayLabel = totals.length === 1 ? 'day' : 'days';

  return (
    <div className="space-y-3" role="figure" aria-label="Total prompt updates per day">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Total updates per day</h3>
        <span className="text-xs text-muted-foreground">Last {totals.length} {dayLabel} tracked</span>
      </div>
      <div className="flex items-end gap-2" aria-hidden="true">
        {totals.map((point) => {
          const heightPercentage = maxCount === 0 ? 0 : Math.round((point.totalCount / maxCount) * 100);

          return (
            <div key={point.date} className="flex min-w-[3rem] flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end overflow-hidden rounded bg-muted">
                <div
                  className="w-full rounded-t bg-primary transition-[height]"
                  style={{ height: `${heightPercentage}%` }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground">
                <div>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(point.date))}</div>
                <div className="font-medium text-foreground">{point.totalCount}</div>
              </div>
            </div>
          );
        })}
      </div>
      <dl className="sr-only">
        {totals.map((point) => (
          <div key={point.date}>
            <dt>{point.formattedDate}</dt>
            <dd>{point.totalCount} prompt updates</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const ActivityTable = ({ activity }: { activity: WorkspacePromptActivity[] }) => {
  if (activity.length === 0) {
    return null;
  }

  const sortedActivity = [...activity].sort((a, b) => {
    const dateComparison = new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime();

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return a.workspaceName.localeCompare(b.workspaceName);
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm" aria-label="Prompt updates by workspace and day">
        <caption className="sr-only">Prompt updates grouped by workspace for each day</caption>
        <thead className="bg-muted/30 text-left">
          <tr>
            <th scope="col" className="px-4 py-2 font-semibold">
              Date
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              Workspace
            </th>
            <th scope="col" className="px-4 py-2 font-semibold">
              Prompt updates
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedActivity.map((row) => (
            <tr key={`${row.workspaceId}-${row.activityDate}`}>
              <td className="px-4 py-2 text-muted-foreground">{formatDateForDisplay(row.activityDate)}</td>
              <td className="px-4 py-2">{row.workspaceName}</td>
              <td className="px-4 py-2 font-medium">{row.promptUpdateCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SkeletonTable = () => (
  <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
    <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  </div>
);

export const WorkspacePromptActivityContent = ({
  activity,
}: {
  activity: WorkspacePromptActivity[];
}) => {
  if (activity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No prompt updates recorded yet. Start iterating on prompts to see daily activity.
      </div>
    );
  }

  const dailyTotals = useMemo(() => computeDailyTotals(activity), [activity]);

  return (
    <div className="space-y-6">
      <ActivityChart totals={dailyTotals} />
      <ActivityTable activity={activity} />
    </div>
  );
};

export const WorkspacePromptActivity = () => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;

  const activityQuery = useQuery({
    ...workspacePromptActivityQueryOptions(userId),
    enabled: !!userId,
  });

  const activity = activityQuery.data ?? [];
  const sectionDescription = 'Visualize how often prompts are updated each day across your workspaces.';

  let content: ReactNode;

  if (sessionQuery.status === 'pending') {
    content = <SkeletonTable />;
  } else if (!userId) {
    content = (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sign in to review prompt updates across your workspaces.
      </div>
    );
  } else if (activityQuery.status === 'pending') {
    content = <SkeletonTable />;
  } else if (activityQuery.status === 'error') {
    const errorMessage =
      activityQuery.error instanceof Error ? activityQuery.error.message : 'Please try again later.';

    content = (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load daily prompt activity. {errorMessage}
      </div>
    );
  } else {
    content = <WorkspacePromptActivityContent activity={activity} />;
  }

  return (
    <section aria-label="Workspace prompt activity" className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Workspace prompt activity</h2>
        <p className="text-sm text-muted-foreground">{sectionDescription}</p>
      </div>
      {content}
    </section>
  );
};
