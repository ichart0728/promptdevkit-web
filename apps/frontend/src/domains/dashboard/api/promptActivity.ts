import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type WorkspacePromptActivity = {
  workspaceId: string;
  workspaceName: string;
  activityDate: string;
  promptUpdateCount: number;
};

type WorkspacePromptActivityRow = {
  workspace_id: string;
  workspace_name: string;
  activity_date: string;
  prompt_update_count: number | null;
};

export const workspacePromptActivityQueryKey = (userId: string | null) =>
  ['workspace-prompt-activity', userId] as const;

export const fetchWorkspacePromptActivity = async (): Promise<WorkspacePromptActivity[]> => {
  const { data, error } = await supabase
    .from('workspace_prompt_activity_daily')
    .select('workspace_id,workspace_name,activity_date,prompt_update_count')
    .order('activity_date', { ascending: true })
    .order('workspace_name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkspacePromptActivityRow[];

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    activityDate: row.activity_date,
    promptUpdateCount: row.prompt_update_count ?? 0,
  }));
};

export const workspacePromptActivityQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: workspacePromptActivityQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch workspace prompt activity without an authenticated user.');
      }

      return fetchWorkspacePromptActivity();
    },
    staleTime: 5 * 60 * 1000,
  });
