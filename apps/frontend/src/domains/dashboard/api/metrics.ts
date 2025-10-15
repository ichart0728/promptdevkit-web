import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const PROMPTS_PER_PERSONAL_WS_LIMIT_KEY = 'prompts_per_personal_ws';
const PROMPTS_PER_TEAM_WS_LIMIT_KEY = 'prompts_per_team_ws';

export type WorkspaceUsage = {
  id: string;
  name: string;
  promptCount: number;
  latestUpdatedAt: string | null;
  workspaceType: 'personal' | 'team' | null;
  planId: string | null;
  planLimitKey: typeof PROMPTS_PER_PERSONAL_WS_LIMIT_KEY | typeof PROMPTS_PER_TEAM_WS_LIMIT_KEY | null;
};

type WorkspaceUsageRow = {
  id: string;
  name: string;
  prompt_count: number | null;
  latest_updated_at: string | null;
};

type WorkspacePlanRow = { plan_id: string | null } | { plan_id: string | null }[] | null;

type WorkspaceMetadataRow = {
  id: string;
  type: 'personal' | 'team';
  owner_user:
    | {
        user_plan: WorkspacePlanRow;
      }
    | null;
  team:
    | {
        created_by_user:
          | {
              user_plan: WorkspacePlanRow;
            }
          | null;
      }
    | null;
};

const mapPlanId = (plan: WorkspacePlanRow): string | null => {
  if (!plan) {
    return null;
  }

  if (Array.isArray(plan)) {
    return plan.length > 0 ? plan[0]?.plan_id ?? null : null;
  }

  return plan.plan_id ?? null;
};

const resolvePlanIdForWorkspace = (metadata: WorkspaceMetadataRow): string | null => {
  if (metadata.type === 'personal') {
    return mapPlanId(metadata.owner_user?.user_plan ?? null);
  }

  if (metadata.type === 'team') {
    return mapPlanId(metadata.team?.created_by_user?.user_plan ?? null);
  }

  return null;
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

  if (rows.length === 0) {
    return [];
  }

  const workspaceIds = rows.map((row) => row.id);

  const { data: metadataData, error: metadataError } = await supabase
    .from('workspaces')
    .select(
      `
        id,
        type,
        owner_user:users!workspaces_owner_fk(
          user_plan:user_plans(plan_id)
        ),
        team:teams!workspaces_team_fk(
          created_by_user:users!teams_created_by_fkey(
            user_plan:user_plans(plan_id)
          )
        )
      `,
    )
    .in('id', workspaceIds);

  if (metadataError) {
    throw metadataError;
  }

  const metadataRows = (metadataData ?? []) as WorkspaceMetadataRow[];

  const metadataById = metadataRows.reduce<Record<string, WorkspaceMetadataRow>>((acc, metadata) => {
    acc[metadata.id] = metadata;
    return acc;
  }, {});

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    promptCount: row.prompt_count ?? 0,
    latestUpdatedAt: row.latest_updated_at,
    workspaceType: metadataById[row.id]?.type ?? null,
    planId: metadataById[row.id] ? resolvePlanIdForWorkspace(metadataById[row.id]) : null,
    planLimitKey:
      metadataById[row.id]?.type === 'personal'
        ? PROMPTS_PER_PERSONAL_WS_LIMIT_KEY
        : metadataById[row.id]?.type === 'team'
          ? PROMPTS_PER_TEAM_WS_LIMIT_KEY
          : null,
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
