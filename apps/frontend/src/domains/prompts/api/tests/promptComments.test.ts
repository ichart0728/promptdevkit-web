import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  commentThreadCommentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  deleteComment,
  fetchPromptCommentThreads,
  fetchThreadComments,
} from '../promptComments';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('commentThreadsQueryKey', () => {
  it('returns a stable tuple including pagination params', () => {
    expect(commentThreadsQueryKey('prompt-1', { offset: 0, limit: 20 })).toEqual([
      'comment-threads',
      'prompt-1',
      { offset: 0, limit: 20 },
    ]);
  });
});

describe('commentThreadCommentsQueryKey', () => {
  it('returns a stable tuple scoped by prompt and thread', () => {
    expect(commentThreadCommentsQueryKey('prompt-1', 'thread-1', { offset: 40, limit: 10 })).toEqual([
      'comment-thread-comments',
      'prompt-1',
      'thread-1',
      { offset: 40, limit: 10 },
    ]);
  });
});

describe('fetchPromptCommentThreads', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('selects comment thread rows filtered by prompt and maps them', async () => {
    const rows = [
      {
        id: 'thread-1',
        prompt_id: 'prompt-1',
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00.000Z',
      },
    ];

    const rangeMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchPromptCommentThreads({ promptId: 'prompt-1', offset: 20, limit: 10 });

    expect(selectMock).toHaveBeenCalledWith('id,prompt_id,created_by,created_at');
    expect(eqMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rangeMock).toHaveBeenCalledWith(20, 29);
    expect(result).toEqual([
      {
        id: 'thread-1',
        promptId: 'prompt-1',
        createdBy: 'user-1',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('fetchThreadComments', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('selects non-deleted comments for a thread and maps rows', async () => {
    const rows = [
      {
        id: 'comment-1',
        thread_id: 'thread-1',
        body: 'Hello world',
        mentions: null,
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T01:00:00.000Z',
        comment_threads: { prompt_id: 'prompt-1' },
      },
    ];

    const rangeMock = vi.fn().mockResolvedValue({ data: rows, error: null });
    const orderMock = vi.fn().mockReturnValue({ range: rangeMock });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const eqPromptMock = vi.fn().mockReturnValue({ is: isMock });
    const eqThreadMock = vi.fn().mockReturnValue({ eq: eqPromptMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqThreadMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchThreadComments({
      promptId: 'prompt-1',
      threadId: 'thread-1',
      offset: 0,
      limit: 20,
    });

    expect(selectMock).toHaveBeenCalledWith(
      'id,thread_id,body,mentions,created_by,created_at,updated_at,comment_threads!inner(prompt_id)',
    );
    expect(eqThreadMock).toHaveBeenCalledWith('thread_id', 'thread-1');
    expect(eqPromptMock).toHaveBeenCalledWith('comment_threads.prompt_id', 'prompt-1');
    expect(isMock).toHaveBeenCalledWith('deleted_at', null);
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(rangeMock).toHaveBeenCalledWith(0, 19);
    expect(result).toEqual([
      {
        id: 'comment-1',
        promptId: 'prompt-1',
        threadId: 'thread-1',
        body: 'Hello world',
        mentions: [],
        createdBy: 'user-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
      },
    ]);
  });
});

describe('createComment', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('inserts a comment scoped to the prompt and returns the created row', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'comment-2',
        thread_id: 'thread-1',
        body: 'New comment',
        mentions: ['user-2'],
        created_by: 'user-1',
        created_at: '2025-01-02T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
        comment_threads: { prompt_id: 'prompt-1' },
      },
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    supabaseFromMock.mockReturnValue({
      insert: insertMock,
    } as never);

    const result = await createComment({
      promptId: 'prompt-1',
      threadId: 'thread-1',
      userId: 'user-1',
      body: 'New comment',
      mentions: ['user-2'],
    });

    expect(insertMock).toHaveBeenCalledWith([
      {
        thread_id: 'thread-1',
        body: 'New comment',
        mentions: ['user-2'],
        created_by: 'user-1',
      },
    ]);
    expect(selectMock).toHaveBeenCalledWith(
      'id,thread_id,body,mentions,created_by,created_at,updated_at,comment_threads!inner(prompt_id)',
    );
    expect(eqMock).toHaveBeenCalledWith('comment_threads.prompt_id', 'prompt-1');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'comment-2',
      promptId: 'prompt-1',
      threadId: 'thread-1',
      body: 'New comment',
      mentions: ['user-2'],
      createdBy: 'user-1',
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    });
  });
});

describe('deleteComment', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('deletes the specified comment scoping filters by thread and user', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'comment-3' }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqUserMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqThreadMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqThreadMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    supabaseFromMock.mockReturnValue({
      delete: deleteMock,
    } as never);

    const result = await deleteComment({
      promptId: 'prompt-1',
      threadId: 'thread-1',
      commentId: 'comment-3',
      userId: 'user-1',
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(eqIdMock).toHaveBeenCalledWith('id', 'comment-3');
    expect(eqThreadMock).toHaveBeenCalledWith('thread_id', 'thread-1');
    expect(eqUserMock).toHaveBeenCalledWith('created_by', 'user-1');
    expect(selectMock).toHaveBeenCalledWith('id');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual('comment-3');
  });
});
