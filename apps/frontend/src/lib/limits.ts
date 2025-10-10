import type { Json } from './supabase.types';

export type PlanLimitRecord = {
  key: string;
  value_int: number | null;
  value_str: string | null;
  value_json: Json | null;
};

export type PlanLimitMap = Record<string, PlanLimitRecord>;

export type IntegerPlanLimitEvaluationStatus =
  | 'missing-limit'
  | 'unlimited'
  | 'within-limit'
  | 'limit-reached'
  | 'limit-exceeded';

export type IntegerPlanLimitEvaluation = {
  key: string;
  currentUsage: number;
  delta: number;
  nextUsage: number;
  limitValue: number | null;
  status: IntegerPlanLimitEvaluationStatus;
  allowed: boolean;
  shouldRecommendUpgrade: boolean;
};

export const indexPlanLimits = (limits: PlanLimitRecord[]): PlanLimitMap =>
  limits.reduce<PlanLimitMap>((acc, limit) => {
    acc[limit.key] = limit;
    return acc;
  }, {});

export type EvaluateIntegerPlanLimitInput = {
  limits: PlanLimitMap | PlanLimitRecord[];
  key: string;
  currentUsage: number;
  delta?: number;
};

export const evaluateIntegerPlanLimit = ({
  limits,
  key,
  currentUsage,
  delta = 1,
}: EvaluateIntegerPlanLimitInput): IntegerPlanLimitEvaluation => {
  const map = Array.isArray(limits) ? indexPlanLimits(limits) : limits;
  const limitRecord = map[key];
  const nextUsage = currentUsage + delta;

  if (!limitRecord) {
    return {
      key,
      currentUsage,
      delta,
      nextUsage,
      limitValue: null,
      status: 'missing-limit',
      allowed: false,
      shouldRecommendUpgrade: true,
    };
  }

  if (limitRecord.value_int === null || typeof limitRecord.value_int === 'undefined') {
    return {
      key,
      currentUsage,
      delta,
      nextUsage,
      limitValue: null,
      status: 'unlimited',
      allowed: true,
      shouldRecommendUpgrade: false,
    };
  }

  const limitValue = limitRecord.value_int;

  if (nextUsage > limitValue) {
    return {
      key,
      currentUsage,
      delta,
      nextUsage,
      limitValue,
      status: 'limit-exceeded',
      allowed: false,
      shouldRecommendUpgrade: true,
    };
  }

  if (nextUsage === limitValue) {
    return {
      key,
      currentUsage,
      delta,
      nextUsage,
      limitValue,
      status: 'limit-reached',
      allowed: true,
      shouldRecommendUpgrade: true,
    };
  }

  return {
    key,
    currentUsage,
    delta,
    nextUsage,
    limitValue,
    status: 'within-limit',
    allowed: true,
    shouldRecommendUpgrade: false,
  };
};

export class PlanLimitError extends Error {
  constructor(public readonly evaluation: IntegerPlanLimitEvaluation) {
    super(`Plan limit exceeded for key "${evaluation.key}"`);
    this.name = 'PlanLimitError';
  }
}
