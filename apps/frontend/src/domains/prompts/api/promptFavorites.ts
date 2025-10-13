import type { PostgrestError } from '@supabase/postgrest-js';

import { PlanLimitError, type IntegerPlanLimitEvaluation } from '@/lib/limits';
import { supabase } from '@/lib/supabase';

export type PromptFavorite = {
  id: string;
  promptId: string;
  userId: string;
  createdAt: string;
};

type PromptFavoriteRow = {
  id: string;
  prompt_id: string;
  user_id: string;
  created_at: string;
};

const mapPromptFavoriteRow = (row: PromptFavoriteRow): PromptFavorite => ({
  id: row.id,
  promptId: row.prompt_id,
  userId: row.user_id,
  createdAt: row.created_at,
});

export const promptFavoritesQueryKey = (promptId: string | null) =>
  ['prompt-favorites', promptId] as const;

export type FetchPromptFavoritesParams = {
  promptId: string;
  userId: string;
};

export const fetchPromptFavorite = async ({
  promptId,
  userId,
}: FetchPromptFavoritesParams): Promise<PromptFavorite | null> => {
  const { data, error } = await supabase
    .from('prompt_favorites')
    .select('id,prompt_id,user_id,created_at')
    .eq('prompt_id', promptId)
    .eq('user_id', userId)
    .maybeSingle<PromptFavoriteRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapPromptFavoriteRow(data as PromptFavoriteRow);
};

export type TogglePromptFavoriteParams = {
  promptId: string;
  userId: string;
  shouldFavorite: boolean;
};

export const togglePromptFavorite = async ({
  promptId,
  userId,
  shouldFavorite,
}: TogglePromptFavoriteParams): Promise<PromptFavorite | null> => {
  if (shouldFavorite) {
    const { data, error } = await supabase
      .from('prompt_favorites')
      .insert(
        [
          {
            prompt_id: promptId,
            user_id: userId,
          },
        ] as never[],
      )
      .select('id,prompt_id,user_id,created_at')
      .single<PromptFavoriteRow>();

    if (error) {
      if (isPlanLimitError(error)) {
        throw toPlanLimitError(error as PostgrestError);
      }

      throw error;
    }

    return mapPromptFavoriteRow(data as PromptFavoriteRow);
  }

  const { error } = await supabase
    .from('prompt_favorites')
    .delete()
    .eq('prompt_id', promptId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return null;
};

const PLAN_LIMIT_ERROR_CODE = 'P0001';
const FAVORITES_PER_USER_LIMIT_KEY = 'favorites_per_user';

const isPostgrestError = (error: unknown): error is PostgrestError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code: unknown }).code === 'string';

const isPlanLimitError = (error: unknown): error is PostgrestError =>
  isPostgrestError(error) && error.code === PLAN_LIMIT_ERROR_CODE;

const parseDetailKeyValue = (detail: string | null | undefined) => {
  if (typeof detail !== 'string' || detail.trim().length === 0) {
    return {} as Record<string, string>;
  }

  return detail.split(' ').reduce<Record<string, string>>((accumulator, token) => {
    const [key, value] = token.split('=');

    if (key && typeof value !== 'undefined') {
      accumulator[key.trim()] = value.trim();
    }

    return accumulator;
  }, {});
};

const toInteger = (value: string | undefined): number | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildFavoritesPerUserEvaluation = (error: PostgrestError): IntegerPlanLimitEvaluation => {
  const details = parseDetailKeyValue(error.details);
  const limitValue = toInteger(details.limit);
  const currentFromDetail = toInteger(details.current);
  const remaining = toInteger(details.remaining);

  const currentUsage =
    typeof currentFromDetail === 'number'
      ? currentFromDetail
      : typeof limitValue === 'number' && typeof remaining === 'number'
        ? Math.max(limitValue - remaining, 0)
        : typeof limitValue === 'number'
          ? limitValue
          : 0;

  const delta = 1;
  const nextUsage = currentUsage + delta;

  return {
    key: FAVORITES_PER_USER_LIMIT_KEY,
    currentUsage,
    delta,
    nextUsage,
    limitValue: typeof limitValue === 'number' ? limitValue : null,
    status: 'limit-exceeded',
    allowed: false,
    shouldRecommendUpgrade: true,
  } satisfies IntegerPlanLimitEvaluation;
};

const toPlanLimitError = (error: PostgrestError): PlanLimitError => {
  const evaluation = buildFavoritesPerUserEvaluation(error);
  const planLimitError = new PlanLimitError(evaluation);

  planLimitError.message = error.message ?? planLimitError.message;
  planLimitError.cause = error;

  return Object.assign(planLimitError, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
};
