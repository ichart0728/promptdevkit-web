import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => {
  const queryCache = new Map<string, unknown>();
  const queryFnCallCount = new Map<string, number>();

  const toKey = (key: unknown) => JSON.stringify(key);

  const useQuery = vi.fn(
    <TData>({
      queryKey,
      queryFn,
      enabled = true,
    }: {
      queryKey: unknown[];
      queryFn: () => Promise<TData>;
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
        const resultPromise = Promise.resolve().then(() => queryFn());
        queryCache.set(key, resultPromise);
      }

      return {
        data: queryCache.get(key) as Promise<TData>,
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
    },
  };
});

import { supabase } from '@/lib/supabase';
import * as reactQueryModule from '@tanstack/react-query';

import {
  commentMentionSuggestionsQueryKey,
  fetchCommentMentionSuggestions,
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
  };
}).__queryMock;

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

describe('fetchCommentMentionSuggestions', () => {
  beforeEach(() => {
    supabaseRpcMock.mockReset();
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

    supabaseRpcMock.mockResolvedValue({ data: rows, error: null });

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
  });

  it('omits the search parameter when no term is provided', async () => {
    supabaseRpcMock.mockResolvedValue({ data: null, error: null });

    await fetchCommentMentionSuggestions({ workspaceId: 'workspace-1', search: '   ' });

    expect(supabaseRpcMock).toHaveBeenCalledWith('search_comment_mentions', {
      p_workspace_id: 'workspace-1',
      p_limit: 20,
    });
  });

  it('throws when the RPC returns an error', async () => {
    const error = { message: 'Permission denied', code: '42501' };
    supabaseRpcMock.mockResolvedValue({ data: null, error });

    await expect(
      fetchCommentMentionSuggestions({ workspaceId: 'workspace-1', search: 'bob' }),
    ).rejects.toEqual(error);
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
});
