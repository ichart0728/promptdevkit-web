import { queryOptions } from '@tanstack/react-query';
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

export type UserPromptFavorite = {
  id: string;
  userId: string;
  promptId: string;
  createdAt: string;
  promptTitle: string;
  promptBody: string;
  promptNote: string | null;
  promptTags: string[];
  promptCreatedAt: string;
  promptUpdatedAt: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'personal' | 'team';
  workspaceTeamId: string | null;
  workspaceOwnerUserId: string | null;
};

type UserPromptFavoriteRow = {
  id: string;
  user_id: string;
  prompt_id: string;
  created_at: string;
  prompt_title: string;
  prompt_body: string;
  prompt_note: string | null;
  prompt_tags: string[] | null;
  prompt_created_at: string;
  prompt_updated_at: string;
  workspace_id: string;
  workspace_name: string;
  workspace_type: 'personal' | 'team';
  workspace_team_id: string | null;
  workspace_owner_user_id: string | null;
};

const USER_PROMPT_FAVORITES_SELECT_COLUMNS =
  [
    'id',
    'user_id',
    'prompt_id',
    'created_at',
    'prompt_title',
    'prompt_body',
    'prompt_note',
    'prompt_tags',
    'prompt_created_at',
    'prompt_updated_at',
    'workspace_id',
    'workspace_name',
    'workspace_type',
    'workspace_team_id',
    'workspace_owner_user_id',
  ].join(',');

const mapUserPromptFavoriteRow = (row: UserPromptFavoriteRow): UserPromptFavorite => ({
  id: row.id,
  userId: row.user_id,
  promptId: row.prompt_id,
  createdAt: row.created_at,
  promptTitle: row.prompt_title,
  promptBody: row.prompt_body,
  promptNote: row.prompt_note,
  promptTags: row.prompt_tags ?? [],
  promptCreatedAt: row.prompt_created_at,
  promptUpdatedAt: row.prompt_updated_at,
  workspaceId: row.workspace_id,
  workspaceName: row.workspace_name,
  workspaceType: row.workspace_type,
  workspaceTeamId: row.workspace_team_id,
  workspaceOwnerUserId: row.workspace_owner_user_id,
});

const normalizeFilterTags = (tags: string[] | undefined): string[] => {
  if (!tags || tags.length === 0) {
    return [];
  }

  const seen = new Set<string>();

  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.toLowerCase())
    .filter((tag) => {
      if (seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    })
    .sort();
};

const escapeIlikePattern = (value: string) =>
  value.replace(/[%_]/g, (match) => `\\${match}`);

export type UserPromptFavoritesFilters = {
  search?: string;
  tags?: string[];
};

export const userPromptFavoritesQueryKey = (
  userId: string | null,
  filters: UserPromptFavoritesFilters = {},
) => {
  const normalizedSearch = filters.search?.trim().toLowerCase() ?? '';
  const normalizedTags = normalizeFilterTags(filters.tags);

  return ['user-prompt-favorites', userId ?? 'anonymous', { search: normalizedSearch, tags: normalizedTags }] as const;
};

export type FetchUserPromptFavoritesParams = {
  userId: string;
  search?: string;
  tags?: string[];
};

export const fetchUserPromptFavorites = async ({
  userId,
  search,
  tags,
}: FetchUserPromptFavoritesParams): Promise<UserPromptFavorite[]> => {
  if (!userId) {
    throw new Error('User ID is required to fetch prompt favorites.');
  }

  const normalizedTags = normalizeFilterTags(tags);
  const normalizedSearch = search?.trim() ?? '';

  let query = supabase
    .from('user_prompt_favorites')
    .select(USER_PROMPT_FAVORITES_SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (normalizedSearch) {
    const pattern = `%${escapeIlikePattern(normalizedSearch)}%`;
    query = query.ilike('prompt_title', pattern);
  }

  if (normalizedTags.length > 0) {
    query = query.contains('prompt_tags', normalizedTags);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as UserPromptFavoriteRow[];

  return rows.map(mapUserPromptFavoriteRow);
};

export const userPromptFavoritesQueryOptions = ({
  userId,
  search,
  tags,
}: {
  userId: string | null;
  search?: string;
  tags?: string[];
}) =>
  queryOptions({
    queryKey: userPromptFavoritesQueryKey(userId, { search, tags }),
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required to load favorites.');
      }

      return fetchUserPromptFavorites({ userId, search, tags });
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

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
