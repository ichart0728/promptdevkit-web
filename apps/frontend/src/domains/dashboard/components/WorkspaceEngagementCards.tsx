import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import {
  workspaceCommentEngagementQueryOptions,
  type WorkspaceCommentEngagement,
} from '../api/commentMetrics';

const formatLatestCommentAt = (isoString: string | null) => {
  if (!isoString) {
    return 'No comments yet';
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return 'No comments yet';
  }

  return `Last comment ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
};

const SkeletonCard = () => (
  <div data-testid="workspace-engagement-card-skeleton" className="rounded-lg border bg-card p-6 shadow-sm">
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  </div>
);

const EngagementCards = ({ engagement }: { engagement: WorkspaceCommentEngagement[] }) => {
  if (engagement.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No comments yet. Encourage your team to start the conversation.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {engagement.map((workspace) => {
        const commentLabel = workspace.commentCount === 1 ? 'comment' : 'comments';
        const latestComment = formatLatestCommentAt(workspace.latestCommentAt);

        return (
          <article
            key={workspace.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm"
            aria-label={`${workspace.name} comment engagement`}
          >
            <div className="space-y-4 p-6">
              <header className="space-y-1">
                <h3 className="text-lg font-semibold">{workspace.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {workspace.commentCount} {commentLabel}
                </p>
              </header>
              <p className="text-sm text-muted-foreground">{latestComment}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export const WorkspaceEngagementCards = () => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;

  const engagementQuery = useQuery({
    ...workspaceCommentEngagementQueryOptions(userId),
    enabled: !!userId,
  });

  const engagement = useMemo(() => engagementQuery.data ?? [], [engagementQuery.data]);
  const sectionDescription = 'Monitor recent comment activity to understand engagement across workspaces.';

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
        Sign in to view comment activity across your workspaces.
      </div>
    );
  } else if (engagementQuery.status === 'pending') {
    content = (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  } else if (engagementQuery.status === 'error') {
    const errorMessage =
      engagementQuery.error instanceof Error ? engagementQuery.error.message : 'Please try again later.';

    content = (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center text-sm text-destructive">
        Failed to load workspace comment engagement. {errorMessage}
      </div>
    );
  } else {
    content = <EngagementCards engagement={engagement} />;
  }

  return (
    <section aria-label="Workspace comment engagement" className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Workspace comment engagement</h2>
        <p className="text-sm text-muted-foreground">{sectionDescription}</p>
      </div>
      {content}
    </section>
  );
};
