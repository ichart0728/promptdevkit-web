import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import type { ActivityRange } from './workspacePromptActivity';
import {
  fetchWorkspacePromptActivity,
  workspacePromptActivityQueryKey,
  workspacePromptActivityQueryOptions,
} from './workspacePromptActivity';

const supabaseFromMock = supabase.from as unknown as Mock;

const fixedNow = new Date('2024-03-10T15:30:00Z');

const expectStartDateForRange = (range: ActivityRange) => {
  const date = new Date(Date.UTC(fixedNow.getUTCFullYear(), fixedNow.getUTCMonth(), fixedNow.getUTCDate()));
  const offsets: Record<ActivityRange, number> = {
    '7d': 6,
    '30d': 29,
    '90d': 89,
  };
  date.setUTCDate(date.getUTCDate() - offsets[range]);
  return date.toISOString().slice(0, 10);
};

describe('workspacePromptActivityQueryKey', () => {
  it('returns a stable key scoped by workspace and range', () => {
    expect(workspacePromptActivityQueryKey('workspace-1', '7d')).toEqual([
      'workspacePromptActivity',
      'workspace-1',
      '7d',
    ]);
    expect(workspacePromptActivityQueryKey(null, '30d')).toEqual([
      'workspacePromptActivity',
      null,
      '30d',
    ]);
  });
});

describe('fetchWorkspacePromptActivity', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps summary and daily rows into a structured response', async () => {
    const summaryMaybeSingleMock = vi
      .fn()
      .mockResolvedValue({
        data: { workspace_id: 'workspace-1', range: '7d', total_count: 12 },
        error: null,
      });
    const summaryEqRangeMock = vi.fn().mockReturnValue({ maybeSingle: summaryMaybeSingleMock });
    const summaryEqWorkspaceMock = vi.fn().mockReturnValue({ eq: summaryEqRangeMock });
    const summarySelectMock = vi.fn().mockReturnValue({ eq: summaryEqWorkspaceMock });

    const dailyOrderMock = vi.fn().mockResolvedValue({
      data: [
        { activity_date: '2024-03-05', prompt_update_count: 2 },
        { activity_date: '2024-03-06', prompt_update_count: null },
      ],
      error: null,
    });
    const dailyLteMock = vi.fn().mockReturnValue({ order: dailyOrderMock });
    const dailyGteMock = vi.fn().mockReturnValue({ lte: dailyLteMock });
    const dailyEqMock = vi.fn().mockReturnValue({ gte: dailyGteMock });
    const dailySelectMock = vi.fn().mockReturnValue({ eq: dailyEqMock });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'workspace_prompt_activity_summary') {
        return { select: summarySelectMock } as never;
      }

      if (table === 'workspace_prompt_activity_daily') {
        return { select: dailySelectMock } as never;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchWorkspacePromptActivity('workspace-1', '7d');

    expect(summarySelectMock).toHaveBeenCalledWith('workspace_id,range,total_count');
    expect(summaryEqWorkspaceMock).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(summaryEqRangeMock).toHaveBeenCalledWith('range', '7d');
    expect(summaryMaybeSingleMock).toHaveBeenCalled();

    expect(dailySelectMock).toHaveBeenCalledWith('activity_date,prompt_update_count');
    expect(dailyEqMock).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(dailyGteMock).toHaveBeenCalledWith('activity_date', expectStartDateForRange('7d'));
    expect(dailyLteMock).toHaveBeenCalledWith('activity_date', '2024-03-10');
    expect(dailyOrderMock).toHaveBeenCalledWith('activity_date', { ascending: true });

    expect(result).toEqual({
      workspaceId: 'workspace-1',
      range: '7d',
      totalCount: 12,
      dailyTotals: [
        { activityDate: '2024-03-05', promptUpdateCount: 2 },
        { activityDate: '2024-03-06', promptUpdateCount: 0 },
      ],
    });
  });

  it('returns zero totals when no summary data exists', async () => {
    const summaryMaybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const summaryEqRangeMock = vi.fn().mockReturnValue({ maybeSingle: summaryMaybeSingleMock });
    const summaryEqWorkspaceMock = vi.fn().mockReturnValue({ eq: summaryEqRangeMock });
    const summarySelectMock = vi.fn().mockReturnValue({ eq: summaryEqWorkspaceMock });

    const dailyOrderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const dailyLteMock = vi.fn().mockReturnValue({ order: dailyOrderMock });
    const dailyGteMock = vi.fn().mockReturnValue({ lte: dailyLteMock });
    const dailyEqMock = vi.fn().mockReturnValue({ gte: dailyGteMock });
    const dailySelectMock = vi.fn().mockReturnValue({ eq: dailyEqMock });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'workspace_prompt_activity_summary') {
        return { select: summarySelectMock } as never;
      }

      if (table === 'workspace_prompt_activity_daily') {
        return { select: dailySelectMock } as never;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchWorkspacePromptActivity('workspace-1', '30d');

    expect(result).toEqual({
      workspaceId: 'workspace-1',
      range: '30d',
      totalCount: 0,
      dailyTotals: [],
    });
  });

  it('throws when the summary query fails', async () => {
    const summaryError = new Error('summary down');
    const summaryMaybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: summaryError });
    const summaryEqRangeMock = vi.fn().mockReturnValue({ maybeSingle: summaryMaybeSingleMock });
    const summaryEqWorkspaceMock = vi.fn().mockReturnValue({ eq: summaryEqRangeMock });
    const summarySelectMock = vi.fn().mockReturnValue({ eq: summaryEqWorkspaceMock });

    const dailyOrderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const dailyLteMock = vi.fn().mockReturnValue({ order: dailyOrderMock });
    const dailyGteMock = vi.fn().mockReturnValue({ lte: dailyLteMock });
    const dailyEqMock = vi.fn().mockReturnValue({ gte: dailyGteMock });
    const dailySelectMock = vi.fn().mockReturnValue({ eq: dailyEqMock });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'workspace_prompt_activity_summary') {
        return { select: summarySelectMock } as never;
      }

      if (table === 'workspace_prompt_activity_daily') {
        return { select: dailySelectMock } as never;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchWorkspacePromptActivity('workspace-1', '90d')).rejects.toBe(summaryError);
  });

  it('throws when the daily query fails', async () => {
    const dailyError = new Error('daily down');
    const summaryMaybeSingleMock = vi
      .fn()
      .mockResolvedValue({ data: { workspace_id: 'workspace-1', range: '7d', total_count: 3 }, error: null });
    const summaryEqRangeMock = vi.fn().mockReturnValue({ maybeSingle: summaryMaybeSingleMock });
    const summaryEqWorkspaceMock = vi.fn().mockReturnValue({ eq: summaryEqRangeMock });
    const summarySelectMock = vi.fn().mockReturnValue({ eq: summaryEqWorkspaceMock });

    const dailyOrderMock = vi.fn().mockResolvedValue({ data: null, error: dailyError });
    const dailyLteMock = vi.fn().mockReturnValue({ order: dailyOrderMock });
    const dailyGteMock = vi.fn().mockReturnValue({ lte: dailyLteMock });
    const dailyEqMock = vi.fn().mockReturnValue({ gte: dailyGteMock });
    const dailySelectMock = vi.fn().mockReturnValue({ eq: dailyEqMock });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'workspace_prompt_activity_summary') {
        return { select: summarySelectMock } as never;
      }

      if (table === 'workspace_prompt_activity_daily') {
        return { select: dailySelectMock } as never;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(fetchWorkspacePromptActivity('workspace-1', '7d')).rejects.toBe(dailyError);
  });
});

describe('workspacePromptActivityQueryOptions', () => {
  it('throws when the user is not authenticated', async () => {
    const options = workspacePromptActivityQueryOptions({ workspaceId: 'workspace-1', range: '7d', userId: null });

    expect(options.queryFn).toBeDefined();
    await expect(
      options.queryFn!({
        queryKey: workspacePromptActivityQueryKey('workspace-1', '7d'),
      } as never),
    ).rejects.toThrowError(
      'Cannot fetch workspace prompt activity without an authenticated user.',
    );
  });

  it('throws when the workspaceId is missing', async () => {
    const options = workspacePromptActivityQueryOptions({ workspaceId: null, range: '7d', userId: 'user-123' });

    expect(options.queryFn).toBeDefined();
    await expect(
      options.queryFn!({
        queryKey: workspacePromptActivityQueryKey(null, '7d'),
      } as never),
    ).rejects.toThrowError(
      'Cannot fetch workspace prompt activity without a workspace.',
    );
  });
});
