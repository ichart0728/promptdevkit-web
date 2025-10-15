import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, selectUsageMock, orderMock, selectMetadataMock, inMock } = vi.hoisted(() => {
  const from = vi.fn();
  const selectUsage = vi.fn();
  const order = vi.fn();
  const selectMetadata = vi.fn();
  const inFn = vi.fn();

  return {
    fromMock: from,
    selectUsageMock: selectUsage,
    orderMock: order,
    selectMetadataMock: selectMetadata,
    inMock: inFn,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchWorkspaceUsage } from './metrics';

beforeEach(() => {
  fromMock.mockReset();
  selectUsageMock.mockReset();
  orderMock.mockReset();
  selectMetadataMock.mockReset();
  inMock.mockReset();

  fromMock.mockImplementation((table: string) => {
    if (table === 'workspace_prompt_usage') {
      return { select: selectUsageMock };
    }

    if (table === 'workspaces') {
      return { select: selectMetadataMock };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  selectUsageMock.mockReturnValue({
    order: orderMock,
  });

  selectMetadataMock.mockReturnValue({
    in: inMock,
  });
});

describe('fetchWorkspaceUsage', () => {
  it('returns workspace usage enriched with metadata relying on id filters only', async () => {
    const usageRows = [
      {
        id: 'workspace-personal',
        name: 'Personal Workspace',
        prompt_count: 3,
        latest_updated_at: null,
      },
      {
        id: 'workspace-team',
        name: 'Team Workspace',
        prompt_count: 8,
        latest_updated_at: '2024-03-01T00:00:00.000Z',
      },
    ];

    const metadataRows = [
      {
        id: 'workspace-personal',
        type: 'personal' as const,
        owner_user_id: 'user-1',
        team_id: null,
        owner_user: {
          user_plan: { plan_id: 'plan-personal' },
        },
        team: null,
      },
      {
        id: 'workspace-team',
        type: 'team' as const,
        owner_user_id: null,
        team_id: 'team-1',
        owner_user: null,
        team: {
          id: 'team-1',
          created_by: 'user-2',
          created_by_user: {
            user_plan: [{ plan_id: 'plan-team' }],
          },
        },
      },
    ];

    orderMock.mockResolvedValue({ data: usageRows, error: null });
    inMock.mockResolvedValue({ data: metadataRows, error: null });

    const result = await fetchWorkspaceUsage();

    expect(fromMock).toHaveBeenNthCalledWith(1, 'workspace_prompt_usage');
    expect(selectUsageMock).toHaveBeenCalledWith('id,name,prompt_count,latest_updated_at');
    expect(orderMock).toHaveBeenCalledWith('name', { ascending: true });
    expect(fromMock).toHaveBeenNthCalledWith(2, 'workspaces');
    const selectMetadataArg = selectMetadataMock.mock.calls[0]?.[0];
    expect(selectMetadataArg).toContain('owner_user:users!workspaces_owner_fk');
    expect(selectMetadataArg).toContain('team:teams!workspaces_team_fk');
    expect(inMock).toHaveBeenCalledWith('id', ['workspace-personal', 'workspace-team']);

    expect(result).toEqual([
      {
        id: 'workspace-personal',
        name: 'Personal Workspace',
        promptCount: 3,
        latestUpdatedAt: null,
        workspaceType: 'personal',
        planId: 'plan-personal',
        planLimitKey: 'prompts_per_personal_ws',
      },
      {
        id: 'workspace-team',
        name: 'Team Workspace',
        promptCount: 8,
        latestUpdatedAt: '2024-03-01T00:00:00.000Z',
        workspaceType: 'team',
        planId: 'plan-team',
        planLimitKey: 'prompts_per_team_ws',
      },
    ]);
  });

  it('returns an empty array when no usage rows are returned and skips metadata queries', async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    const result = await fetchWorkspaceUsage();

    expect(result).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(inMock).not.toHaveBeenCalled();
  });

  it('throws when metadata query fails', async () => {
    orderMock.mockResolvedValue({
      data: [
        {
          id: 'workspace-1',
          name: 'Workspace One',
          prompt_count: 1,
          latest_updated_at: null,
        },
      ],
      error: null,
    });

    const metadataError = new Error('Metadata failed');
    inMock.mockResolvedValue({ data: null, error: metadataError });

    await expect(fetchWorkspaceUsage()).rejects.toBe(metadataError);
  });
});
