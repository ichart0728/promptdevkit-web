import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  fetchWorkspaceCommentEngagement,
  workspaceCommentEngagementQueryKey,
} from './commentMetrics';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('workspaceCommentEngagementQueryKey', () => {
  it('creates a stable tuple keyed by user id', () => {
    expect(workspaceCommentEngagementQueryKey('user-1')).toEqual([
      'workspace-comment-engagement',
      'user-1',
    ]);
    expect(workspaceCommentEngagementQueryKey(null)).toEqual([
      'workspace-comment-engagement',
      null,
    ]);
  });
});

describe('fetchWorkspaceCommentEngagement', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('returns comment engagement rows mapped to camelCase without throwing', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'workspace-1',
          name: 'Workspace One',
          comment_count: 5,
          latest_comment_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'workspace-2',
          name: 'Workspace Two',
          comment_count: null,
          latest_comment_at: null,
        },
      ],
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchWorkspaceCommentEngagement();

    expect(supabaseFromMock).toHaveBeenCalledWith('workspace_comment_engagement');
    expect(selectMock).toHaveBeenCalledWith('id,name,comment_count,latest_comment_at');
    expect(orderMock).toHaveBeenCalledWith('name', { ascending: true });
    expect(result).toEqual([
      {
        id: 'workspace-1',
        name: 'Workspace One',
        commentCount: 5,
        latestCommentAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'workspace-2',
        name: 'Workspace Two',
        commentCount: 0,
        latestCommentAt: null,
      },
    ]);
  });

  it('throws when the query returns an error', async () => {
    const queryError = new Error('Unexpected failure');
    const orderMock = vi.fn().mockResolvedValue({ data: null, error: queryError });
    const selectMock = vi.fn().mockReturnValue({ order: orderMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    await expect(fetchWorkspaceCommentEngagement()).rejects.toBe(queryError);
  });
});
