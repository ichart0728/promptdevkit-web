import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';

import {
  fetchTeamMembershipEvents,
  teamMembershipEventsQueryOptions,
} from '../teams';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('fetchTeamMembershipEvents', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('maps rows returned by the view into typed events', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'event-1',
          team_id: 'team-1',
          event_type: 'member_added',
          occurred_at: '2024-02-01T08:30:00.000Z',
          actor_user_id: 'user-1',
          actor_email: 'owner@example.com',
          actor_name: 'Team Owner',
          actor_avatar_url: null,
          target_user_id: 'user-2',
          target_email: 'member@example.com',
          target_name: 'Team Member',
          target_avatar_url: 'https://example.com/avatar.png',
          previous_role: null,
          new_role: 'editor',
        },
        {
          id: 'event-2',
          team_id: 'team-1',
          event_type: 'member_left',
          occurred_at: '2024-02-10T10:00:00.000Z',
          actor_user_id: 'user-2',
          actor_email: 'member@example.com',
          actor_name: null,
          actor_avatar_url: null,
          target_user_id: 'user-2',
          target_email: 'member@example.com',
          target_name: 'Team Member',
          target_avatar_url: null,
          previous_role: 'viewer',
          new_role: null,
        },
      ],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    supabaseFromMock.mockReturnValue({ select: selectMock });

    const result = await fetchTeamMembershipEvents('team-1');

    expect(supabaseFromMock).toHaveBeenCalledWith('team_membership_event_feed');
    expect(selectMock).toHaveBeenCalledWith(
      `id,team_id,event_type,occurred_at,
       actor_user_id,actor_email,actor_name,actor_avatar_url,
       target_user_id,target_email,target_name,target_avatar_url,
       previous_role,new_role`,
    );
    expect(eqMock).toHaveBeenCalledWith('team_id', 'team-1');
    expect(orderMock).toHaveBeenCalledWith('occurred_at', { ascending: false });

    expect(result).toEqual([
      {
        id: 'event-1',
        teamId: 'team-1',
        eventType: 'member_added',
        occurredAt: '2024-02-01T08:30:00.000Z',
        actor: {
          id: 'user-1',
          email: 'owner@example.com',
          name: 'Team Owner',
          avatarUrl: null,
        },
        target: {
          id: 'user-2',
          email: 'member@example.com',
          name: 'Team Member',
          avatarUrl: 'https://example.com/avatar.png',
        },
        previousRole: null,
        newRole: 'editor',
      },
      {
        id: 'event-2',
        teamId: 'team-1',
        eventType: 'member_left',
        occurredAt: '2024-02-10T10:00:00.000Z',
        actor: {
          id: 'user-2',
          email: 'member@example.com',
          name: null,
          avatarUrl: null,
        },
        target: {
          id: 'user-2',
          email: 'member@example.com',
          name: 'Team Member',
          avatarUrl: null,
        },
        previousRole: 'viewer',
        newRole: null,
      },
    ]);
  });

  it('throws when Supabase returns an error', async () => {
    const error = { message: 'permission denied' };
    const orderMock = vi.fn().mockResolvedValue({ data: null, error });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    supabaseFromMock.mockReturnValue({ select: selectMock });

    await expect(fetchTeamMembershipEvents('team-1')).rejects.toBe(error);
  });
});

describe('teamMembershipEventsQueryOptions', () => {
  it('builds query options with the correct key and fetcher', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    supabaseFromMock.mockReturnValue({ select: selectMock });

    const options = teamMembershipEventsQueryOptions('team-1');

    expect(options.queryKey).toEqual(['team-membership-events', 'team-1']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(30 * 1000);

    expect(options.queryFn).toBeTypeOf('function');
    const context = { queryKey: ['team-membership-events', 'team-1'] } as never;

    await options.queryFn!(context);
    expect(eqMock).toHaveBeenCalledWith('team_id', 'team-1');
  });

  it('disables fetching when the team id is empty', () => {
    const options = teamMembershipEventsQueryOptions('');

    expect(options.enabled).toBe(false);
  });
});
