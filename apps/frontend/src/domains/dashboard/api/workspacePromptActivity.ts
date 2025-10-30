import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ActivityRange = '7d' | '30d' | '90d';

export type WorkspacePromptActivityPoint = {
  activityDate: string;
  promptUpdateCount: number;
};

export type WorkspacePromptActivityResponse = {
  workspaceId: string;
  range: ActivityRange;
  totalCount: number;
  dailyTotals: WorkspacePromptActivityPoint[];
};

const RANGE_TO_DAYS: Record<ActivityRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const toDateOnlyString = (date: Date) => date.toISOString().slice(0, 10);

const calculateStartDate = (range: ActivityRange): string => {
  const days = RANGE_TO_DAYS[range];
  const now = new Date();
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  utcNow.setUTCDate(utcNow.getUTCDate() - (days - 1));

  return toDateOnlyString(utcNow);
};

const calculateEndDate = (): string => {
  const now = new Date();

  return toDateOnlyString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
};

type WorkspacePromptActivitySummaryRow = {
  workspace_id: string;
  range: ActivityRange;
  total_count: number | null;
};

type WorkspacePromptActivityDailyRow = {
  activity_date: string;
  prompt_update_count: number | null;
};

export const workspacePromptActivityQueryKey = (
  workspaceId: string | null,
  range: ActivityRange,
) => ['workspacePromptActivity', workspaceId, range] as const;

export const fetchWorkspacePromptActivity = async (
  workspaceId: string,
  range: ActivityRange,
): Promise<WorkspacePromptActivityResponse> => {
  const startDate = calculateStartDate(range);
  const endDate = calculateEndDate();

  const [summaryResult, dailyResult] = await Promise.all([
    supabase
      .from('workspace_prompt_activity_summary')
      .select('workspace_id,range,total_count')
      .eq('workspace_id', workspaceId)
      .eq('range', range)
      .maybeSingle<WorkspacePromptActivitySummaryRow>(),
    supabase
      .from('workspace_prompt_activity_daily')
      .select('activity_date,prompt_update_count')
      .eq('workspace_id', workspaceId)
      .gte('activity_date', startDate)
      .lte('activity_date', endDate)
      .order('activity_date', { ascending: true }),
  ]);

  if (summaryResult.error) {
    throw summaryResult.error;
  }

  if (dailyResult.error) {
    throw dailyResult.error;
  }

  const summaryRow = summaryResult.data;
  const dailyRows = (dailyResult.data ?? []) as WorkspacePromptActivityDailyRow[];

  return {
    workspaceId,
    range,
    totalCount: summaryRow?.total_count ?? 0,
    dailyTotals: dailyRows.map((row) => ({
      activityDate: row.activity_date,
      promptUpdateCount: row.prompt_update_count ?? 0,
    })),
  };
};

type WorkspacePromptActivityQueryOptionsArgs = {
  workspaceId: string | null;
  range: ActivityRange;
  userId: string | null;
};

export const workspacePromptActivityQueryOptions = ({
  workspaceId,
  range,
  userId,
}: WorkspacePromptActivityQueryOptionsArgs) =>
  queryOptions({
    queryKey: workspacePromptActivityQueryKey(workspaceId, range),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch workspace prompt activity without an authenticated user.');
      }

      if (!workspaceId) {
        throw new Error('Cannot fetch workspace prompt activity without a workspace.');
      }

      return fetchWorkspacePromptActivity(workspaceId, range);
    },
    staleTime: 60 * 1000,
  });
