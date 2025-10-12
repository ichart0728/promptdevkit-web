import { queryOptions } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type TeamMemberRole = 'admin' | 'editor' | 'viewer';

export type TeamMember = {
  id: string;
  role: TeamMemberRole;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  } | null;
};

export type Team = {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  planId: string | null;
  members: TeamMember[];
};

type TeamMemberUserRow = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
};

type TeamMemberRow = {
  id: string;
  role: TeamMemberRole;
  joined_at: string;
  user: TeamMemberUserRow | null;
};

type TeamOwnerPlanRow = { plan_id: string } | { plan_id: string }[] | null;

type TeamRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  created_by_user: {
    user_plan: TeamOwnerPlanRow;
  } | null;
  team_members: TeamMemberRow[] | null;
};

const mapOwnerPlan = (plan: TeamOwnerPlanRow): string | null => {
  if (!plan) {
    return null;
  }

  if (Array.isArray(plan)) {
    return plan.length > 0 ? plan[0]?.plan_id ?? null : null;
  }

  return plan.plan_id ?? null;
};

const mapMember = (row: TeamMemberRow): TeamMember => ({
  id: row.id,
  role: row.role,
  joinedAt: row.joined_at,
  user: row.user
    ? {
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        avatarUrl: row.user.avatar_url,
      }
    : null,
});

const mapRowToTeam = (row: TeamRow): Team => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  createdBy: row.created_by,
  planId: mapOwnerPlan(row.created_by_user?.user_plan ?? null),
  members: (row.team_members ?? []).map(mapMember),
});

// Query key: ['teams', userId]
export const teamsQueryKey = (userId: string | null) => ['teams', userId ?? 'anonymous'] as const;

export const fetchTeams = async (): Promise<Team[]> => {
  const { data, error } = await supabase
    .from('teams')
    .select(
      `id,name,created_at,created_by,
       created_by_user:users!teams_created_by_fkey(
         user_plan:user_plans(plan_id)
       ),
       team_members(
         id,role,joined_at,
         user:users(
           id,email,name,avatar_url
         )
       )`
    )
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TeamRow[];

  return rows.map(mapRowToTeam);
};

export const teamsQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: teamsQueryKey(userId),
    queryFn: async () => {
      if (!userId) {
        throw new Error('Cannot fetch teams without an authenticated user.');
      }

      return fetchTeams();
    },
    staleTime: 60 * 1000,
  });

type UpdateTeamMemberRoleParams = {
  teamId: string;
  memberId: string;
  role: TeamMemberRole;
};

export const updateTeamMemberRole = async ({
  teamId,
  memberId,
  role,
}: UpdateTeamMemberRoleParams): Promise<void> => {
  const { error } = await supabase
    .from('team_members')
    .update({ role } as never)
    .eq('team_id', teamId)
    .eq('id', memberId);

  if (error) {
    throw error;
  }
};

type RemoveTeamMemberParams = {
  teamId: string;
  memberId: string;
};

export const removeTeamMember = async ({
  teamId,
  memberId,
}: RemoveTeamMemberParams): Promise<void> => {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('id', memberId);

  if (error) {
    throw error;
  }
};
