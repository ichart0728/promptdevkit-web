import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  commentThreadCommentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  createCommentThread,
  deleteComment,
  deleteCommentThread,
  fetchPromptCommentThreads,
  fetchThreadComments,
  SupabasePlanLimitError,
} from '../promptComments';

const supabaseFromMock = supabase.from as unknown as Mock;
const supabaseRpcMock = supabase.rpc as unknown as Mock;

describe('commentThreadsQueryKey', () => {
  it('returns a stable tuple including pagination params', () => {
    expect(commentThreadsQueryKey('prompt-1', { offset: 0, limit: 20 })).toEqual([
      'prompt-comments',
      'prompt-1',
      'threads',
      { offset: 0, limit: 20 },
    ]);
  });
});

describe('commentThreadCommentsQueryKey', () => {
  it('returns a stable tuple scoped by prompt and thread', () => {
    expect(commentThreadCommentsQueryKey('prompt-1', 'thread-1', { offset: 40, limit: 10 })).toEqual([
      'prompt-comments',
      'prompt-1',
      'threads',
      'thread-1',
      'comments',
      { offset: 40, limit: 10 },
    ]);
  });
});

describe('fetchPromptCommentThreads', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    supabaseRpcMock.mockReset();
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
    supabaseRpcMock.mockReset();
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
    supabaseRpcMock.mockReset();
  });

  it('validates the thread belongs to the prompt before inserting and returns the created row', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { id: 'thread-1', prompt_id: 'prompt-1' },
      error: null,
    });
    const eqPromptThreadMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqThreadIdMock = vi.fn().mockReturnValue({ eq: eqPromptThreadMock });
    const selectThreadMock = vi.fn().mockReturnValue({ eq: eqThreadIdMock });

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

    supabaseFromMock
      .mockReturnValueOnce({
        select: selectThreadMock,
      } as never)
      .mockReturnValueOnce({
        insert: insertMock,
      } as never);

    const result = await createComment({
      promptId: 'prompt-1',
      threadId: 'thread-1',
      userId: 'user-1',
      body: 'New comment',
      mentions: ['user-2'],
    });

    expect(supabaseFromMock).toHaveBeenNthCalledWith(1, 'comment_threads');
    expect(selectThreadMock).toHaveBeenCalledWith('id,prompt_id');
    expect(eqThreadIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(eqPromptThreadMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(maybeSingleMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenNthCalledWith(2, 'comments');
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

  it('throws when the thread does not belong to the prompt', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqPromptThreadMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqThreadIdMock = vi.fn().mockReturnValue({ eq: eqPromptThreadMock });
    const selectThreadMock = vi.fn().mockReturnValue({ eq: eqThreadIdMock });

    supabaseFromMock.mockReturnValueOnce({
      select: selectThreadMock,
    } as never);

    await expect(
      createComment({
        promptId: 'prompt-1',
        threadId: 'thread-2',
        userId: 'user-1',
        body: 'New comment',
      }),
    ).rejects.toThrow('Comment thread does not belong to the specified prompt.');

    expect(supabaseFromMock).toHaveBeenCalledTimes(1);
    expect(supabaseFromMock).toHaveBeenCalledWith('comment_threads');
    expect(selectThreadMock).toHaveBeenCalledWith('id,prompt_id');
    expect(eqThreadIdMock).toHaveBeenCalledWith('id', 'thread-2');
    expect(eqPromptThreadMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(maybeSingleMock).toHaveBeenCalled();
  });
});

describe('createCommentThread', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    supabaseRpcMock.mockReset();
  });

  it('calls the RPC helper and maps the resulting row', async () => {
    const rpcResponse = {
      id: 'thread-99',
      prompt_id: 'prompt-1',
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00.000Z',
    };

    supabaseRpcMock.mockResolvedValue({ data: rpcResponse, error: null });

    const result = await createCommentThread({
      promptId: 'prompt-1',
      body: 'Initial comment',
      mentions: ['user-2'],
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith('create_comment_thread', {
      p_prompt_id: 'prompt-1',
      p_body: 'Initial comment',
      p_mentions: ['user-2'],
    });
    expect(result).toEqual({
      id: 'thread-99',
      promptId: 'prompt-1',
      createdBy: 'user-1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('wraps plan limit violations preserving detail and hint', async () => {
    supabaseRpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        details: 'Plan allows only 2 threads.',
        hint: 'Upgrade your plan to continue.',
        message: 'Plan limit exceeded.',
      },
    });

    await createCommentThread({ promptId: 'prompt-1', body: 'Initial comment' }).catch((error) => {
      expect(error).toBeInstanceOf(SupabasePlanLimitError);
      expect(error).toMatchObject({
        detail: 'Plan allows only 2 threads.',
        hint: 'Upgrade your plan to continue.',
        message: 'Plan limit exceeded.',
      });
    });
  });
});

describe('deleteComment', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    supabaseRpcMock.mockReset();
  });

  it('deletes the specified comment scoping filters by thread and user', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'comment-3' }, error: null });
    const eqPromptMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqPromptMock });
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
    expect(selectMock).toHaveBeenCalledWith('id,comment_threads!inner(prompt_id)');
    expect(eqPromptMock).toHaveBeenCalledWith('comment_threads.prompt_id', 'prompt-1');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual('comment-3');
  });
});

describe('deleteCommentThread', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    supabaseRpcMock.mockReset();
  });

  it('removes the thread scoping by prompt and author', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'thread-1' }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqCreatedByMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqCreatedByMock });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqPromptMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    supabaseFromMock.mockReturnValue({
      delete: deleteMock,
    } as never);

    const result = await deleteCommentThread({
      promptId: 'prompt-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(eqIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(eqPromptMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(eqCreatedByMock).toHaveBeenCalledWith('created_by', 'user-1');
    expect(selectMock).toHaveBeenCalledWith('id');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual('thread-1');
  });

  it('wraps plan limit errors from Supabase', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        details: 'You cannot delete threads on the current plan.',
        hint: 'Contact support for assistance.',
        message: 'Plan restriction.',
      },
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqCreatedByMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqCreatedByMock });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqPromptMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqIdMock });

    supabaseFromMock.mockReturnValue({
      delete: deleteMock,
    } as never);

    await deleteCommentThread({ promptId: 'prompt-1', threadId: 'thread-1', userId: 'user-1' }).catch(
      (error) => {
        expect(error).toBeInstanceOf(SupabasePlanLimitError);
        expect(error).toMatchObject({
          detail: 'You cannot delete threads on the current plan.',
          hint: 'Contact support for assistance.',
          message: 'Plan restriction.',
        });
      },
    );
  });
});
