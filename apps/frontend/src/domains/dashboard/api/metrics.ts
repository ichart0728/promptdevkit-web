import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type WorkspaceUsage = {
  id: string;
  name: string;
  promptCount: number;
  latestUpdatedAt: string | null;
};

type WorkspaceUsageRow = {
  id: string;
  name: string;
  prompt_count: number | null;
  latest_updated_at: string | null;
};

export const workspaceUsageQueryKey = (userId: string | null) => ['workspace-usage', userId] as const;

export const fetchWorkspaceUsage = async (): Promise<WorkspaceUsage[]> => {
  const { data, error } = await supabase
    .from('workspace_prompt_usage')
    .select('id,name,prompt_count,latest_updated_at')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkspaceUsageRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    promptCount: row.prompt_count ?? 0,
    latestUpdatedAt: row.latest_updated_at,
  }));
};

export const workspaceUsageQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: workspaceUsageQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch workspace usage without an authenticated user.');
      }

      return fetchWorkspaceUsage();
    },
    staleTime: 60 * 1000,
  });
