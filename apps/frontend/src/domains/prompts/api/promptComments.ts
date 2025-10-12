import type { PostgrestError } from '@supabase/postgrest-js';

import { supabase } from '@/lib/supabase';

export type CommentThread = {
  id: string;
  promptId: string;
  createdBy: string;
  createdAt: string;
};

export type Comment = {
  id: string;
  promptId: string;
  threadId: string;
  body: string;
  mentions: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type CommentThreadRow = {
  id: string;
  prompt_id: string;
  created_by: string;
  created_at: string;
};

type CommentRow = {
  id: string;
  thread_id: string;
  body: string;
  mentions: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  comment_threads?: {
    prompt_id: string;
  } | null;
};

const mapCommentThreadRow = (row: CommentThreadRow): CommentThread => ({
  id: row.id,
  promptId: row.prompt_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const mapCommentRow = (row: CommentRow, expectedPromptId?: string): Comment => ({
  id: row.id,
  promptId: expectedPromptId ?? row.comment_threads?.prompt_id ?? '',
  threadId: row.thread_id,
  body: row.body,
  mentions: row.mentions ?? [],
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const PLAN_LIMIT_ERROR_CODE = 'P0001';

const sanitizeSupabaseString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export class SupabasePlanLimitError extends Error {
  readonly code = PLAN_LIMIT_ERROR_CODE;

  readonly detail: string | null;

  readonly hint: string | null;

  constructor(error: PostgrestError) {
    super(sanitizeSupabaseString(error.message) ?? 'Plan limit exceeded.');
    this.name = 'SupabasePlanLimitError';
    this.detail = sanitizeSupabaseString(error.details);
    this.hint = sanitizeSupabaseString(error.hint);
  }
}

const throwSupabaseError = (error: PostgrestError): never => {
  if (error.code === PLAN_LIMIT_ERROR_CODE) {
    throw new SupabasePlanLimitError(error);
  }

  throw error;
};

export const promptCommentsQueryKey = (promptId: string | null) =>
  ['prompt-comments', promptId] as const;

export const commentThreadsQueryKey = (
  promptId: string | null,
  pagination: { offset: number; limit: number },
) => [...promptCommentsQueryKey(promptId), 'threads', pagination] as const;

export const commentThreadCommentsQueryKey = (
  promptId: string | null,
  threadId: string | null,
  pagination: { offset: number; limit: number },
) => [...promptCommentsQueryKey(promptId), 'threads', threadId, 'comments', pagination] as const;

export type FetchPromptCommentThreadsParams = {
  promptId: string;
  offset: number;
  limit: number;
};

export const fetchPromptCommentThreads = async ({
  promptId,
  offset,
  limit,
}: FetchPromptCommentThreadsParams): Promise<CommentThread[]> => {
  const to = offset + limit - 1;

  const { data, error } = await supabase
    .from('comment_threads')
    .select('id,prompt_id,created_by,created_at')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: false })
    .range(offset, to);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as CommentThreadRow[];

  return rows.map(mapCommentThreadRow);
};

export type FetchThreadCommentsParams = {
  promptId: string;
  threadId: string;
  offset: number;
  limit: number;
};

export const fetchThreadComments = async ({
  promptId,
  threadId,
  offset,
  limit,
}: FetchThreadCommentsParams): Promise<Comment[]> => {
  const to = offset + limit - 1;

  const { data, error } = await supabase
    .from('comments')
    .select(
      'id,thread_id,body,mentions,created_by,created_at,updated_at,comment_threads!inner(prompt_id)',
    )
    .eq('thread_id', threadId)
    .eq('comment_threads.prompt_id', promptId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .range(offset, to);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as CommentRow[];

  return rows.map((row) => mapCommentRow(row, promptId));
};

export type CreateCommentParams = {
  promptId: string;
  threadId: string;
  userId: string;
  body: string;
  mentions?: string[];
};

export const createComment = async ({
  promptId,
  threadId,
  userId,
  body,
  mentions,
}: CreateCommentParams): Promise<Comment> => {
  const { data: thread, error: threadLookupError } = await supabase
    .from('comment_threads')
    .select('id,prompt_id')
    .eq('id', threadId)
    .eq('prompt_id', promptId)
    .maybeSingle<{ id: string; prompt_id: string }>();

  if (threadLookupError) {
    throw threadLookupError;
  }

  if (!thread) {
    throw new Error('Comment thread does not belong to the specified prompt.');
  }

  const mentionsPayload = mentions ?? [];

  const insertPayload = [
    {
      thread_id: threadId,
      body,
      mentions: mentionsPayload,
      created_by: userId,
    },
  ];

  const { data, error } = await supabase
    .from('comments')
    .insert(insertPayload as never[])
    .select(
      'id,thread_id,body,mentions,created_by,created_at,updated_at,comment_threads!inner(prompt_id)',
    )
    .eq('comment_threads.prompt_id', promptId)
    .single<CommentRow>();

  if (error) {
    throw error;
  }

  return mapCommentRow(data as CommentRow, promptId);
};

export type CreateCommentThreadParams = {
  promptId: string;
  body: string;
  mentions?: string[];
};

export const createCommentThread = async ({
  promptId,
  body,
  mentions,
}: CreateCommentThreadParams): Promise<CommentThread> => {
  const { data, error } = (await supabase.rpc('create_comment_thread', {
    p_prompt_id: promptId,
    p_body: body,
    p_mentions: mentions ?? [],
  } as never)) as unknown as { data: CommentThreadRow | null; error: PostgrestError | null };

  if (error) {
    throwSupabaseError(error);
  }

  if (!data) {
    throw new Error('Failed to create comment thread.');
  }

  return mapCommentThreadRow(data);
};

export type DeleteCommentParams = {
  promptId: string;
  threadId: string;
  commentId: string;
  userId: string;
};

export const deleteComment = async ({
  promptId,
  threadId,
  commentId,
  userId,
}: DeleteCommentParams) => {
  const { data, error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('thread_id', threadId)
    .eq('created_by', userId)
    .select('id,comment_threads!inner(prompt_id)')
    .eq('comment_threads.prompt_id', promptId)
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data?.id ?? commentId;
};

export type UpdateCommentParams = {
  promptId: string;
  threadId: string;
  commentId: string;
  userId: string;
  body: string;
};

export const updateComment = async ({
  promptId,
  threadId,
  commentId,
  userId,
  body,
}: UpdateCommentParams): Promise<Comment> => {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    throw new Error('Comment cannot be empty.');
  }

  const { data, error } = await supabase
    .from('comments')
    .update({ body: trimmedBody } as never)
    .eq('id', commentId)
    .eq('thread_id', threadId)
    .eq('created_by', userId)
    .select(
      'id,thread_id,body,mentions,created_by,created_at,updated_at,comment_threads!inner(prompt_id)',
    )
    .eq('comment_threads.prompt_id', promptId)
    .single<CommentRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update comment.');
  }

  return mapCommentRow(data as CommentRow, promptId);
};

export type DeleteCommentThreadParams = {
  promptId: string;
  threadId: string;
  userId: string;
};

export const deleteCommentThread = async ({
  promptId,
  threadId,
  userId,
}: DeleteCommentThreadParams) => {
  const { data, error } = await supabase
    .from('comment_threads')
    .delete()
    .eq('id', threadId)
    .eq('prompt_id', promptId)
    .eq('created_by', userId)
    .select('id')
    .single<{ id: string }>();

  if (error) {
    throwSupabaseError(error);
  }

  return data?.id ?? threadId;
};
