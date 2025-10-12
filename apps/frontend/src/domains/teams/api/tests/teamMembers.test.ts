import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { PlanLimitError } from '@/lib/limits';

import { addTeamMember, inviteTeamMember, TeamInviteUserNotFoundError } from '../teams';

const supabaseFromMock = supabase.from as unknown as Mock;
const supabaseRpcMock = supabase.rpc as unknown as Mock;

describe('addTeamMember', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('inserts a new team member and maps the returned row', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'member-1',
        role: 'admin',
        joined_at: '2025-01-01T00:00:00.000Z',
        user: {
          id: 'user-2',
          email: 'member@example.com',
          name: 'Member User',
          avatar_url: null,
        },
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    supabaseFromMock.mockReturnValue({
      insert: insertMock,
    } as never);

    const result = await addTeamMember({ teamId: 'team-1', userId: 'user-2', role: 'admin' });

    expect(supabaseFromMock).toHaveBeenCalledWith('team_members');
    expect(insertMock).toHaveBeenCalledWith([
      {
        team_id: 'team-1',
        user_id: 'user-2',
        role: 'admin',
      },
    ]);
    expect(selectMock).toHaveBeenCalledWith(
      `id,role,joined_at,
       user:users(
         id,email,name,avatar_url
       )`,
    );
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'member-1',
      role: 'admin',
      joinedAt: '2025-01-01T00:00:00.000Z',
      user: {
        id: 'user-2',
        email: 'member@example.com',
        name: 'Member User',
        avatarUrl: null,
      },
    });
  });

  it('throws a PlanLimitError when Supabase signals a members_per_team limit breach', async () => {
    const postgrestError = {
      code: 'P0001',
      message: 'Plan limit exceeded for key "members_per_team".',
      details: 'limit=3 current=3 remaining=0 plan=free team_id=team-1',
      hint: 'Remove members from this team or upgrade the subscription plan.',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: postgrestError });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    supabaseFromMock.mockReturnValue({
      insert: insertMock,
    } as never);

    const promise = addTeamMember({ teamId: 'team-1', userId: 'user-3', role: 'viewer' });

    await expect(promise).rejects.toBeInstanceOf(PlanLimitError);

    await promise.catch((error) => {
      expect(error).toMatchObject({
        evaluation: {
          key: 'members_per_team',
          currentUsage: 3,
          delta: 1,
          nextUsage: 4,
          limitValue: 3,
          status: 'limit-exceeded',
          allowed: false,
          shouldRecommendUpgrade: true,
        },
        code: 'P0001',
        details: 'limit=3 current=3 remaining=0 plan=free team_id=team-1',
        hint: 'Remove members from this team or upgrade the subscription plan.',
        cause: postgrestError,
      });
    });
  });

  it('rethrows non plan limit Postgrest errors', async () => {
    const postgrestError = {
      code: '42501',
      message: 'permission denied for table team_members',
      details: null,
      hint: null,
    };

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: postgrestError });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    supabaseFromMock.mockReturnValue({
      insert: insertMock,
    } as never);

    await expect(
      addTeamMember({ teamId: 'team-1', userId: 'user-4', role: 'editor' }),
    ).rejects.toBe(postgrestError);
  });
});

describe('inviteTeamMember', () => {
  beforeEach(() => {
    supabaseRpcMock.mockReset();
  });

  it('invokes the invite RPC and maps the response', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'member-9',
        role: 'viewer',
        joined_at: '2025-01-05T00:00:00.000Z',
        user: {
          id: 'user-9',
          email: 'rpc.member@example.com',
          name: 'RPC Member',
          avatar_url: null,
        },
      },
      error: null,
    });

    supabaseRpcMock.mockReturnValue({ single: singleMock });

    const result = await inviteTeamMember({
      teamId: 'team-9',
      email: 'RPC.Member@example.com',
      role: 'viewer',
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith('invite_team_member', {
      p_team_id: 'team-9',
      p_invitee_email: 'rpc.member@example.com',
      p_role: 'viewer',
    });
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'member-9',
      role: 'viewer',
      joinedAt: '2025-01-05T00:00:00.000Z',
      user: {
        id: 'user-9',
        email: 'rpc.member@example.com',
        name: 'RPC Member',
        avatarUrl: null,
      },
    });
  });

  it('throws TeamInviteUserNotFoundError when the RPC signals a missing user', async () => {
    const rpcError = {
      code: 'P0200',
      message: 'No user found for the provided email address.',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: rpcError });
    supabaseRpcMock.mockReturnValue({ single: singleMock });

    await expect(
      inviteTeamMember({ teamId: 'team-10', email: 'missing@example.com', role: 'viewer' }),
    ).rejects.toBeInstanceOf(TeamInviteUserNotFoundError);
  });

  it('throws PlanLimitError when the RPC reports a limit breach', async () => {
    const rpcError = {
      code: 'P0001',
      message: 'Plan limit exceeded for key "members_per_team".',
      details: 'limit=3 current=3 remaining=0 plan=free team_id=team-10',
      hint: 'Remove members from this team or upgrade the subscription plan.',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: rpcError });
    supabaseRpcMock.mockReturnValue({ single: singleMock });

    await expect(
      inviteTeamMember({ teamId: 'team-10', email: 'full@example.com', role: 'viewer' }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it('rethrows unexpected errors from the RPC call', async () => {
    const rpcError = {
      code: '42501',
      message: 'permission denied',
    };

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: rpcError });
    supabaseRpcMock.mockReturnValue({ single: singleMock });

    await expect(
      inviteTeamMember({ teamId: 'team-10', email: 'forbidden@example.com', role: 'viewer' }),
    ).rejects.toBe(rpcError);
  });
});
