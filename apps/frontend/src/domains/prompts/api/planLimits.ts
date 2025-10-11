import { supabase } from '@/lib/supabase';
import { indexPlanLimits, type PlanLimitMap, type PlanLimitRecord } from '@/lib/limits';

export const userPlanQueryKey = (userId: string | null) => ['user-plan', userId] as const;

export type FetchUserPlanIdParams = {
  userId: string;
};

type UserPlanRow = {
  plan_id: string;
};

export const fetchUserPlanId = async ({ userId }: FetchUserPlanIdParams): Promise<string> => {
  const { data, error } = await supabase
    .from('user_plans')
    .select('plan_id')
    .eq('user_id', userId)
    .maybeSingle<UserPlanRow>();

  if (error) {
    throw error;
  }

  if (!data?.plan_id) {
    throw new Error('No plan is associated with the current user.');
  }

  return data.plan_id;
};

export const planLimitsQueryKey = (planId: string) => ['plan-limits', planId] as const;

export type FetchPlanLimitsParams = {
  planId: string;
};

type PlanLimitRow = Pick<PlanLimitRecord, 'key' | 'value_int' | 'value_str' | 'value_json'>;

export const fetchPlanLimits = async ({ planId }: FetchPlanLimitsParams): Promise<PlanLimitMap> => {
  const { data, error } = await supabase
    .from('plan_limits')
    .select('key,value_int,value_str,value_json')
    .eq('plan_id', planId);

  if (error) {
    throw error;
  }

  const limits = (data ?? []) as PlanLimitRow[];

  return indexPlanLimits(
    limits.map((limit) => ({
      key: limit.key,
      value_int: limit.value_int ?? null,
      value_str: limit.value_str ?? null,
      value_json: limit.value_json ?? null,
    })),
  );
};
