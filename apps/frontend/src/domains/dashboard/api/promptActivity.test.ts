import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  fetchWorkspacePromptActivity,
  workspacePromptActivityQueryKey,
} from './promptActivity';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('workspacePromptActivityQueryKey', () => {
  it('returns a stable key scoped by user', () => {
    expect(workspacePromptActivityQueryKey('user-123')).toEqual(['workspace-prompt-activity', 'user-123']);
    expect(workspacePromptActivityQueryKey(null)).toEqual(['workspace-prompt-activity', null]);
  });
});

describe('fetchWorkspacePromptActivity', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('maps rows from the daily activity view into camelCase objects', async () => {
    const finalOrderMock = vi.fn().mockResolvedValue({
      data: [
        {
          workspace_id: 'workspace-1',
          workspace_name: 'Personal Lab',
          activity_date: '2024-03-01',
          prompt_update_count: 2,
        },
        {
          workspace_id: 'workspace-2',
          workspace_name: 'Team Hub',
          activity_date: '2024-03-02',
          prompt_update_count: null,
        },
      ],
      error: null,
    });
    const firstOrderMock = vi.fn().mockReturnValue({ order: finalOrderMock });
    const selectMock = vi.fn().mockReturnValue({ order: firstOrderMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchWorkspacePromptActivity();

    expect(supabaseFromMock).toHaveBeenCalledWith('workspace_prompt_activity_daily');
    expect(selectMock).toHaveBeenCalledWith(
      'workspace_id,workspace_name,activity_date,prompt_update_count',
    );
    expect(firstOrderMock).toHaveBeenCalledWith('activity_date', { ascending: true });
    expect(finalOrderMock).toHaveBeenCalledWith('workspace_name', { ascending: true });
    expect(result).toEqual([
      {
        workspaceId: 'workspace-1',
        workspaceName: 'Personal Lab',
        activityDate: '2024-03-01',
        promptUpdateCount: 2,
      },
      {
        workspaceId: 'workspace-2',
        workspaceName: 'Team Hub',
        activityDate: '2024-03-02',
        promptUpdateCount: 0,
      },
    ]);
  });

  it('throws when the query fails', async () => {
    const queryError = new Error('Daily view unavailable');
    const finalOrderMock = vi.fn().mockResolvedValue({ data: null, error: queryError });
    const firstOrderMock = vi.fn().mockReturnValue({ order: finalOrderMock });
    const selectMock = vi.fn().mockReturnValue({ order: firstOrderMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    await expect(fetchWorkspacePromptActivity()).rejects.toBe(queryError);
  });
});
