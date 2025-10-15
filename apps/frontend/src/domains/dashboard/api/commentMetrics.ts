import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type WorkspaceCommentEngagement = {
  id: string;
  name: string;
  commentCount: number;
  latestCommentAt: string | null;
};

type WorkspaceCommentEngagementRow = {
  id: string;
  name: string;
  comment_count: number | null;
  latest_comment_at: string | null;
};

export const workspaceCommentEngagementQueryKey = (userId: string | null) =>
  ['workspace-comment-engagement', userId] as const;

export const fetchWorkspaceCommentEngagement = async (): Promise<WorkspaceCommentEngagement[]> => {
  const { data, error } = await supabase
    .from('workspace_comment_engagement')
    .select('id,name,comment_count,latest_comment_at')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkspaceCommentEngagementRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    commentCount: row.comment_count ?? 0,
    latestCommentAt: row.latest_comment_at,
  }));
};

export const workspaceCommentEngagementQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: workspaceCommentEngagementQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch workspace comment engagement without an authenticated user.');
      }

      return fetchWorkspaceCommentEngagement();
    },
    staleTime: 60 * 1000,
  });
