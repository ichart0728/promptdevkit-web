import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, selectMock, orderMock, orMock } = vi.hoisted(() => {
  const from = vi.fn();
  const select = vi.fn();
  const order = vi.fn();
  const or = vi.fn();

  return {
    fromMock: from,
    selectMock: select,
    orderMock: order,
    orMock: or,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

import type { Workspace } from './workspaces';
import { fetchWorkspaces } from './workspaces';

beforeEach(() => {
  fromMock.mockReset();
  selectMock.mockReset();
  orderMock.mockReset();
  orMock.mockReset();

  orMock.mockImplementation(() => {
    throw new Error('or() should not be called when fetching workspaces.');
  });

  fromMock.mockReturnValue({
    select: selectMock,
  });

  selectMock.mockReturnValue({
    order: orderMock,
    or: orMock,
  });
});

describe('fetchWorkspaces', () => {
  it('returns workspaces ordered by creation date without using OR filters', async () => {
    const rows = [
      {
        id: 'workspace-1',
        name: 'Workspace One',
        type: 'personal' as const,
        team_id: null,
        archived_at: null,
        created_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'workspace-2',
        name: 'Workspace Two',
        type: 'team' as const,
        team_id: 'team-1',
        archived_at: '2024-02-01T00:00:00.000Z',
        created_at: '2024-01-02T00:00:00.000Z',
      },
    ];

    orderMock.mockResolvedValue({ data: rows, error: null });

    const result = await fetchWorkspaces();

    expect(fromMock).toHaveBeenCalledWith('workspaces');
    expect(selectMock).toHaveBeenCalledWith('id,name,type,team_id,archived_at,created_at');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(orMock).not.toHaveBeenCalled();
    expect(result).toEqual<Workspace[]>([
      {
        id: 'workspace-1',
        name: 'Workspace One',
        type: 'personal',
        teamId: null,
        archivedAt: null,
      },
      {
        id: 'workspace-2',
        name: 'Workspace Two',
        type: 'team',
        teamId: 'team-1',
        archivedAt: '2024-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('throws when Supabase returns an error', async () => {
    const supabaseError = new Error('Supabase error');

    orderMock.mockResolvedValue({ data: null, error: supabaseError });

    await expect(fetchWorkspaces()).rejects.toBe(supabaseError);
  });
});
