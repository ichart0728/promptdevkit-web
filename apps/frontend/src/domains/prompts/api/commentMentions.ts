import { supabase } from '@/lib/supabase';

export type CommentMentionSuggestion = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type CommentMentionSuggestionRow = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const normalizeSearchTerm = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

const clampLimit = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  const floored = Math.floor(value);
  if (!Number.isFinite(floored)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(floored, 1), MAX_LIMIT);
};

const mapSuggestionRow = (row: CommentMentionSuggestionRow): CommentMentionSuggestion => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatar_url ?? null,
});

export type FetchCommentMentionSuggestionsParams = {
  workspaceId: string;
  search?: string | null;
  limit?: number;
};

type FetchCommentMentionSuggestionsOptions = {
  signal?: AbortSignal;
};

export const fetchCommentMentionSuggestions = async (
  { workspaceId, search, limit }: FetchCommentMentionSuggestionsParams,
  { signal }: FetchCommentMentionSuggestionsOptions = {},
): Promise<CommentMentionSuggestion[]> => {
  const normalizedSearch = normalizeSearchTerm(search);
  const sanitizedLimit = clampLimit(limit);

  const params: Record<string, unknown> = {
    p_workspace_id: workspaceId,
    p_limit: sanitizedLimit,
  };

  if (normalizedSearch !== null) {
    params.p_search_term = normalizedSearch;
  }

  type RpcResult = {
    data: CommentMentionSuggestionRow[] | null;
    error: ({ message: string; code?: string } & Record<string, unknown>) | null;
  };

  const rpcQuery = supabase.rpc('search_comment_mentions', params as never) as unknown as {
    abortSignal?: (signal: AbortSignal) => unknown;
  } & Promise<RpcResult>;

  if (signal && typeof rpcQuery.abortSignal === 'function') {
    rpcQuery.abortSignal(signal);
  }

  const { data, error } = await rpcQuery;

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as CommentMentionSuggestionRow[];
  return rows.map(mapSuggestionRow);
};

export const commentMentionSuggestionsQueryKey = (
  workspaceId: string | null,
  search: string | null | undefined,
  limit?: number | null,
) => {
  const normalizedSearch = normalizeSearchTerm(search);
  const sanitizedLimit = clampLimit(limit);

  return [
    'prompt-comments',
    'mention-suggestions',
    workspaceId,
    normalizedSearch ?? '',
    sanitizedLimit,
  ] as const;
};

