import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { workspaceUsageQueryOptions, type WorkspaceUsage } from '../api/metrics';

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

const UsageCards = ({ usage }: { usage: WorkspaceUsage[] }) => {
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
              <p className="text-sm text-muted-foreground">{latestUpdate}</p>
            </div>
          </article>
        );
      })}
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
    content = <UsageCards usage={usageQuery.data ?? []} />;
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
