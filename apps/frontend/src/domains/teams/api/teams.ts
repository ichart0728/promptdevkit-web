import { queryOptions } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/postgrest-js';

import { PlanLimitError, type IntegerPlanLimitEvaluation } from '@/lib/limits';

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

export class TeamInviteUserNotFoundError extends Error {
  constructor(public readonly email: string) {
    super(`No user found with email: ${email}`);
    this.name = 'TeamInviteUserNotFoundError';
  }
}

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

type InviteTeamMemberRow = {
  id: string;
  role: TeamMemberRole;
  joined_at: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
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

const PLAN_LIMIT_ERROR_CODE = 'P0001';
const MEMBERS_PER_TEAM_LIMIT_KEY = 'members_per_team';

const parseDetailKeyValue = (detail: string | null | undefined) => {
  if (!detail) {
    return {} as Record<string, string>;
  }

  return detail.split(' ').reduce<Record<string, string>>((acc, token) => {
    const [key, value] = token.split('=');

    if (key && typeof value !== 'undefined') {
      acc[key.trim()] = value.trim();
    }

    return acc;
  }, {});
};

const toInteger = (value: string | undefined): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildMembersPerTeamEvaluation = (error: PostgrestError): IntegerPlanLimitEvaluation => {
  const detailMap = parseDetailKeyValue(error.details);
  const limitValue = toInteger(detailMap.limit);
  const currentUsageFromDetail = toInteger(detailMap.current);
  const remaining = toInteger(detailMap.remaining);

  const currentUsage =
    typeof currentUsageFromDetail === 'number'
      ? currentUsageFromDetail
      : typeof limitValue === 'number' && typeof remaining === 'number'
        ? Math.max(limitValue - remaining, 0)
        : typeof limitValue === 'number'
          ? limitValue
          : 0;

  const delta = 1;
  const nextUsage = currentUsage + delta;

  return {
    key: MEMBERS_PER_TEAM_LIMIT_KEY,
    currentUsage,
    delta,
    nextUsage,
    limitValue: typeof limitValue === 'number' ? limitValue : null,
    status: 'limit-exceeded',
    allowed: false,
    shouldRecommendUpgrade: true,
  };
};

const toPlanLimitError = (error: PostgrestError): PlanLimitError => {
  const planLimitError = new PlanLimitError(buildMembersPerTeamEvaluation(error));

  planLimitError.message = error.message ?? planLimitError.message;
  planLimitError.cause = error;

  return Object.assign(planLimitError, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
};

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

type AddTeamMemberParams = {
  teamId: string;
  userId: string;
  role: TeamMemberRole;
};

type InviteTeamMemberParams = {
  teamId: string;
  email: string;
  role: TeamMemberRole;
};

export const addTeamMember = async ({
  teamId,
  userId,
  role,
}: AddTeamMemberParams): Promise<TeamMember> => {
  const { data, error } = await supabase
    .from('team_members')
    .insert(
      [
        {
          team_id: teamId,
          user_id: userId,
          role,
        },
      ] as never,
    )
    .select(
      `id,role,joined_at,
       user:users(
         id,email,name,avatar_url
       )`,
    )
    .single();

  if (error) {
    if ((error as PostgrestError).code === PLAN_LIMIT_ERROR_CODE) {
      throw toPlanLimitError(error as PostgrestError);
    }

    throw error;
  }

  if (!data) {
    throw new Error('Failed to create team member. No data returned from Supabase.');
  }

  return mapMember(data as TeamMemberRow);
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const inviteTeamMember = async ({
  teamId,
  email,
  role,
}: InviteTeamMemberParams): Promise<TeamMember> => {
  const normalizedEmail = normalizeEmail(email);
  const { data, error } = await supabase
    .rpc(
      'invite_team_member',
      {
        p_team_id: teamId,
        p_invitee_email: normalizedEmail,
        p_role: role,
      } as never,
    )
    .single<InviteTeamMemberRow>();

  if (error) {
    if ((error as PostgrestError).code === 'P0200') {
      throw new TeamInviteUserNotFoundError(normalizedEmail);
    }

    if ((error as PostgrestError).code === PLAN_LIMIT_ERROR_CODE) {
      throw toPlanLimitError(error as PostgrestError);
    }

    throw error;
  }

  if (!data) {
    throw new Error('Failed to invite team member. No data returned from Supabase.');
  }

  const user = data.user
    ? {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name ?? data.user.email,
        avatar_url: data.user.avatar_url,
      }
    : null;

  return mapMember({
    id: data.id,
    role: data.role,
    joined_at: data.joined_at,
    user,
  });
};
