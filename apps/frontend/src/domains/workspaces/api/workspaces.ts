import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type Workspace = {
  id: string;
  name: string;
  type: 'personal' | 'team';
  teamId: string | null;
  archivedAt: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  type: Workspace['type'];
  team_id: string | null;
  archived_at: string | null;
  created_at: string;
};

const WORKSPACE_SELECT_COLUMNS = 'id,name,type,team_id,archived_at,created_at';

export const workspacesQueryKey = (userId: string | null) => ['workspaces', userId ?? 'anonymous'] as const;

const mapRowToWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  type: row.type,
  teamId: row.team_id,
  archivedAt: row.archived_at,
});

export const fetchWorkspaces = async (): Promise<Workspace[]> => {
  const { data, error } = await supabase
    .from('workspaces')
    // Rely on RLS instead of constructing manual OR filters (which produced 400s).
    .select(WORKSPACE_SELECT_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as WorkspaceRow[];

  return rows.map(mapRowToWorkspace);
};

export type CreateWorkspaceParams = {
  name: string;
  type: Workspace['type'];
  teamId?: string | null;
};

export const createWorkspace = async ({
  name,
  type,
  teamId = null,
}: CreateWorkspaceParams): Promise<Workspace> => {
  const { data, error } = await supabase.rpc('create_workspace', {
    workspace_name: name,
    workspace_type: type,
    workspace_team_id: type === 'team' ? teamId : null,
  } as never);

  if (error) {
    throw error;
  }

  const row = data as WorkspaceRow | null;

  if (!row) {
    throw new Error('Workspace creation did not return a result.');
  }

  return mapRowToWorkspace(row);
};

export type ManageWorkspaceAction = 'rename' | 'archive' | 'restore';

export type ManageWorkspaceParams =
  | {
      workspaceId: string;
      action: 'archive' | 'restore';
    }
  | {
      workspaceId: string;
      action: 'rename';
      name: string;
    };

type ManageWorkspaceRpcInput = {
  workspace_id: string;
  action: ManageWorkspaceAction;
  workspace_name?: string | null;
};

export const manageWorkspace = async (params: ManageWorkspaceParams): Promise<Workspace> => {
  const rpcInput: ManageWorkspaceRpcInput = {
    workspace_id: params.workspaceId,
    action: params.action,
    workspace_name: params.action === 'rename' ? params.name : null,
  };

  const { data, error } = await supabase.rpc('manage_workspace', rpcInput as never);

  if (error) {
    throw error;
  }

  const row = data as WorkspaceRow | null;

  if (!row) {
    throw new Error('Workspace update did not return a result.');
  }

  return mapRowToWorkspace(row);
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
