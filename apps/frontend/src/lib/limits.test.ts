import { describe, expect, it } from 'vitest';

import {
  evaluateIntegerPlanLimit,
  indexPlanLimits,
  type IntegerPlanLimitEvaluationStatus,
  type PlanLimitRecord,
} from './limits';

describe('evaluateIntegerPlanLimit', () => {
  const planLimits: PlanLimitRecord[] = [
    {
      key: 'prompts_per_personal_ws',
      value_int: 5,
      value_str: null,
      value_json: null,
    },
  ];

  it('evaluates all integer limit states', () => {
    const limitMap = indexPlanLimits(planLimits);

    const withinLimit = evaluateIntegerPlanLimit({
      limits: limitMap,
      key: 'prompts_per_personal_ws',
      currentUsage: 2,
    });
    expect(withinLimit.status).toBe<'within-limit'>('within-limit');
    expect(withinLimit.allowed).toBe(true);

    const limitReached = evaluateIntegerPlanLimit({
      limits: limitMap,
      key: 'prompts_per_personal_ws',
      currentUsage: 4,
    });
    expect(limitReached.status).toBe<'limit-reached'>('limit-reached');
    expect(limitReached.allowed).toBe(true);
    expect(limitReached.shouldRecommendUpgrade).toBe(true);

    const limitExceeded = evaluateIntegerPlanLimit({
      limits: limitMap,
      key: 'prompts_per_personal_ws',
      currentUsage: 5,
    });
    expect(limitExceeded.status).toBe<'limit-exceeded'>('limit-exceeded');
    expect(limitExceeded.allowed).toBe(false);

    const missingLimit = evaluateIntegerPlanLimit({
      limits: limitMap,
      key: 'unknown_limit_key',
      currentUsage: 0,
    });
    expect(missingLimit.status).toBe<'missing-limit'>('missing-limit');
    expect(missingLimit.allowed).toBe(false);

    const unlimitedLimit = evaluateIntegerPlanLimit({
      limits: [
        {
          key: 'unlimited',
          value_int: null,
          value_str: null,
          value_json: null,
        },
      ],
      key: 'unlimited',
      currentUsage: 999,
    });
    expect(unlimitedLimit.status).toBe<IntegerPlanLimitEvaluationStatus>('unlimited');
    expect(unlimitedLimit.allowed).toBe(true);
  });
});
