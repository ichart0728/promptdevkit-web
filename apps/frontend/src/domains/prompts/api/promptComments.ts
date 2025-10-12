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

export const commentThreadsQueryKey = (
  promptId: string | null,
  pagination: { offset: number; limit: number },
) => ['comment-threads', promptId, pagination] as const;

export const commentThreadCommentsQueryKey = (
  promptId: string | null,
  threadId: string | null,
  pagination: { offset: number; limit: number },
) => ['comment-thread-comments', promptId, threadId, pagination] as const;

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
