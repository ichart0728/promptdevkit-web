import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => {
  type CacheEntry<TData> = {
    promise: Promise<TData>;
    controller: AbortController;
  };

  const queryCache = new Map<string, CacheEntry<unknown>>();
  const queryFnCallCount = new Map<string, number>();

  const toKey = (key: unknown) => JSON.stringify(key);

  const useQuery = vi.fn(
    <TData>({
      queryKey,
      queryFn,
      enabled = true,
    }: {
      queryKey: unknown[];
      queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
      enabled?: boolean;
    }) => {
      const key = toKey(queryKey);

      if (!enabled) {
        return {
          data: undefined,
          isFetching: false,
          isLoading: false,
          queryKey,
          refetch: vi.fn(),
        };
      }

      if (!queryCache.has(key)) {
        queryFnCallCount.set(key, (queryFnCallCount.get(key) ?? 0) + 1);

        const controller = new AbortController();
        const resultPromise = Promise.resolve().then(() => queryFn({ signal: controller.signal }));

        queryCache.set(key, {
          promise: resultPromise,
          controller,
        });
      }

      const cacheEntry = queryCache.get(key) as CacheEntry<TData>;

      return {
        data: cacheEntry.promise,
        isFetching: false,
        isLoading: false,
        queryKey,
        refetch: vi.fn(),
      };
    },
  );

  return {
    useQuery,
    __queryMock: {
      reset: () => {
        queryCache.clear();
        queryFnCallCount.clear();
        useQuery.mockClear();
      },
      getCallCount: (queryKey: readonly unknown[]) => queryFnCallCount.get(toKey(queryKey)) ?? 0,
      getSignal: (queryKey: readonly unknown[]) => {
        const entry = queryCache.get(toKey(queryKey));
        return entry?.controller.signal ?? null;
      },
    },
  };
});

import { supabase } from '@/lib/supabase';
import * as reactQueryModule from '@tanstack/react-query';

import {
  commentMentionSuggestionsQueryKey,
  fetchCommentMentionSuggestions,
  normalizeSearchTerm,
  type CommentMentionSuggestion,
} from '../commentMentions';
import * as commentMentionsApi from '../commentMentions';
import { useCommentMentionSuggestions } from '../../hooks/useCommentMentionSuggestions';

const supabaseRpcMock = supabase.rpc as unknown as Mock;
const useQueryMock = reactQueryModule.useQuery as unknown as Mock;
const queryMockHelpers = (reactQueryModule as unknown as {
  __queryMock: {
    reset: () => void;
    getCallCount: (queryKey: readonly unknown[]) => number;
    getSignal: (queryKey: readonly unknown[]) => AbortSignal | null;
  };
}).__queryMock;

type RpcRow = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
};

type RpcResponse = {
  data: RpcRow[] | null;
  error: ({ message: string; code?: string } & Record<string, unknown>) | null;
};

const createRpcResponse = (response: RpcResponse) => {
  const promise = Promise.resolve(response) as Promise<RpcResponse> & {
    abortSignal: Mock;
  };

  promise.abortSignal = vi.fn().mockReturnValue(promise);

  return promise;
};

type RpcPromise = ReturnType<typeof createRpcResponse>;
let lastRpcResponse: RpcPromise | null = null;

describe('commentMentionSuggestionsQueryKey', () => {
  it('normalizes search term and limit for caching', () => {
    expect(commentMentionSuggestionsQueryKey('workspace-1', ' Alice ', 99)).toEqual([
      'prompt-comments',
      'mention-suggestions',
      'workspace-1',
      'alice',
      50,
    ]);
  });

  it('coerces missing values to cache-safe defaults', () => {
    expect(commentMentionSuggestionsQueryKey(null, null, undefined)).toEqual([
      'prompt-comments',
      'mention-suggestions',
      null,
      '',
      20,
    ]);
  });
});

describe('normalizeSearchTerm', () => {
  it('trims whitespace and lowercases the value', () => {
    expect(normalizeSearchTerm('  Alice  ')).toBe('alice');
  });

  it('returns null when the input is empty or non-string', () => {
    expect(normalizeSearchTerm('   ')).toBeNull();
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm(null)).toBeNull();
  });
});

describe('fetchCommentMentionSuggestions', () => {
  beforeEach(() => {
    supabaseRpcMock.mockReset();
    lastRpcResponse = null;
  });

  it('calls the RPC with sanitized params and maps rows', async () => {
    const rows = [
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatar_url: 'https://example.com/alice.png',
      },
    ];

    supabaseRpcMock.mockImplementation(() => {
      lastRpcResponse = createRpcResponse({ data: rows, error: null });
      return lastRpcResponse;
    });

    const result = await fetchCommentMentionSuggestions({
      workspaceId: 'workspace-1',
      search: ' Alice ',
      limit: 72,
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith('search_comment_mentions', {
      p_workspace_id: 'workspace-1',
      p_search_term: 'alice',
      p_limit: 50,
    });
    expect(result).toEqual<CommentMentionSuggestion[]>([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        avatarUrl: 'https://example.com/alice.png',
      },
    ]);

    expect(lastRpcResponse?.abortSignal).toBeDefined();
    expect(lastRpcResponse?.abortSignal.mock.calls).toHaveLength(0);
  });

  it('omits the search parameter when no term is provided', async () => {
    supabaseRpcMock.mockImplementation(() => {
      lastRpcResponse = createRpcResponse({ data: null, error: null });
      return lastRpcResponse;
    });

    await fetchCommentMentionSuggestions({ workspaceId: 'workspace-1', search: '   ' });

    expect(supabaseRpcMock).toHaveBeenCalledWith('search_comment_mentions', {
      p_workspace_id: 'workspace-1',
      p_limit: 20,
    });
  });

  it('throws when the RPC returns an error', async () => {
    const error = { message: 'Permission denied', code: '42501' };
    supabaseRpcMock.mockImplementation(() => {
      lastRpcResponse = createRpcResponse({ data: null, error });
      return lastRpcResponse;
    });

    await expect(
      fetchCommentMentionSuggestions({ workspaceId: 'workspace-1', search: 'bob' }),
    ).rejects.toEqual(error);
  });

  it('passes abort signals through to the Supabase client', async () => {
    const controller = new AbortController();
    supabaseRpcMock.mockImplementation(() => {
      lastRpcResponse = createRpcResponse({ data: [], error: null });
      return lastRpcResponse;
    });

    await fetchCommentMentionSuggestions(
      { workspaceId: 'workspace-1', search: 'Alice' },
      { signal: controller.signal },
    );

    expect(lastRpcResponse?.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});

describe('useCommentMentionSuggestions', () => {
  beforeEach(() => {
    supabaseRpcMock.mockReset();
    queryMockHelpers.reset();
  });

  it('disables the query when workspace id is missing', () => {
    useCommentMentionSuggestions({ workspaceId: null, search: 'alice' });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('uses normalized query key and reuses cached results', async () => {
    const fetchSpy = vi
      .spyOn(commentMentionsApi, 'fetchCommentMentionSuggestions')
      .mockResolvedValue([
        {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          avatarUrl: null,
        },
      ] satisfies CommentMentionSuggestion[]);

    const params = { workspaceId: 'workspace-1', search: 'Alice' };

    useCommentMentionSuggestions(params);
    await Promise.resolve();

    useCommentMentionSuggestions(params);
    await Promise.resolve();

    const expectedKey = commentMentionSuggestionsQueryKey('workspace-1', 'Alice', undefined);

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expectedKey,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(queryMockHelpers.getCallCount(expectedKey)).toBe(1);

    fetchSpy.mockRestore();
  });

  it('creates distinct cache entries per workspace and search', async () => {
    const fetchSpy = vi
      .spyOn(commentMentionsApi, 'fetchCommentMentionSuggestions')
      .mockResolvedValue([]);

    useCommentMentionSuggestions({ workspaceId: 'workspace-1', search: 'alice' });
    useCommentMentionSuggestions({ workspaceId: 'workspace-2', search: 'alice' });
    useCommentMentionSuggestions({ workspaceId: 'workspace-1', search: 'bob' });

    await Promise.resolve();

    const keyWorkspace1Alice = commentMentionSuggestionsQueryKey('workspace-1', 'alice', undefined);
    const keyWorkspace2Alice = commentMentionSuggestionsQueryKey('workspace-2', 'alice', undefined);
    const keyWorkspace1Bob = commentMentionSuggestionsQueryKey('workspace-1', 'bob', undefined);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(queryMockHelpers.getCallCount(keyWorkspace1Alice)).toBe(1);
    expect(queryMockHelpers.getCallCount(keyWorkspace2Alice)).toBe(1);
    expect(queryMockHelpers.getCallCount(keyWorkspace1Bob)).toBe(1);

    fetchSpy.mockRestore();
  });

  it('reuses cached results without creating new abort signals', async () => {
    const fetchSpy = vi
      .spyOn(commentMentionsApi, 'fetchCommentMentionSuggestions')
      .mockResolvedValue([]);

    const params = { workspaceId: 'workspace-1', search: 'alice' };

    useCommentMentionSuggestions(params);
    await Promise.resolve();

    const expectedKey = commentMentionSuggestionsQueryKey('workspace-1', 'alice', undefined);
    const firstSignal = queryMockHelpers.getSignal(expectedKey);

    useCommentMentionSuggestions(params);
    await Promise.resolve();

    const secondSignal = queryMockHelpers.getSignal(expectedKey);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(firstSignal).toBe(secondSignal);

    fetchSpy.mockRestore();
  });
});
