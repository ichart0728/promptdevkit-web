import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type Workspace = {
  id: string;
  name: string;
  type: 'personal' | 'team';
  teamId: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  type: Workspace['type'];
  team_id: string | null;
};

export const workspacesQueryKey = (userId: string | null) => ['workspaces', userId ?? 'anonymous'] as const;

const mapRowToWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  type: row.type,
  teamId: row.team_id,
});

export const fetchWorkspaces = async (): Promise<Workspace[]> => {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id,name,type,team_id')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkspaceRow[];

  return rows.map(mapRowToWorkspace);
};

export const workspacesQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: workspacesQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch workspaces without an authenticated user.');
      }

      return fetchWorkspaces();
    },
    staleTime: 60 * 1000,
  });
