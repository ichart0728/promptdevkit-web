import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptCommentsPanel } from '../PromptCommentsPanel';
import {
  createComment,
  createCommentThread,
  deleteComment,
  updateComment,
  fetchPromptCommentThreads,
  fetchThreadComments,
  SupabasePlanLimitError,
  type Comment,
  type CommentThread,
} from '../../api/promptComments';
import { fetchPlanLimits, fetchUserPlanId } from '../../api/planLimits';
import { useCommentMentionSuggestions } from '../../hooks/useCommentMentionSuggestions';
import type * as ToastModule from '@/components/common/toast';

vi.mock('../../api/promptComments', () => ({
  fetchPromptCommentThreads: vi.fn(),
  fetchThreadComments: vi.fn(),
  createComment: vi.fn(),
  createCommentThread: vi.fn(),
  deleteComment: vi.fn(),
  updateComment: vi.fn(),
  promptCommentsQueryKey: (promptId: string | null) => ['prompt-comments', promptId] as const,
  commentThreadsQueryKey: (
    promptId: string | null,
    pagination: { offset: number; limit: number },
  ) => ['prompt-comments', promptId, 'threads', pagination] as const,
  commentThreadCommentsQueryKey: (
    promptId: string | null,
    threadId: string | null,
    pagination: { offset: number; limit: number },
  ) => ['prompt-comments', promptId, 'threads', threadId, 'comments', pagination] as const,
  SupabasePlanLimitError: class MockSupabasePlanLimitError extends Error {
    code = 'P0001';
    detail: string | null;
    hint: string | null;

    constructor(error: { message?: string | null; details?: string | null; hint?: string | null }) {
      super(error.message ?? 'Plan limit exceeded.');
      this.name = 'SupabasePlanLimitError';
      this.detail = error.details ?? null;
      this.hint = error.hint ?? null;
    }
  },
}));

vi.mock('../../api/planLimits', () => ({
  fetchUserPlanId: vi.fn(),
  fetchPlanLimits: vi.fn(),
  userPlanQueryKey: (userId: string | null) => ['user-plan', userId] as const,
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
}));

vi.mock('@/components/common/UpgradeDialog', () => ({
  UpgradeDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-dialog">Upgrade required</div> : null,
}));

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<typeof ToastModule.toast>) => toastMock(...args),
}));

vi.mock('../../hooks/useCommentMentionSuggestions', () => ({
  useCommentMentionSuggestions: vi.fn(),
}));

const fetchPromptCommentThreadsMock = vi.mocked(fetchPromptCommentThreads);
const fetchThreadCommentsMock = vi.mocked(fetchThreadComments);
const createCommentMock = vi.mocked(createComment);
const createCommentThreadMock = vi.mocked(createCommentThread);
const deleteCommentMock = vi.mocked(deleteComment);
const updateCommentMock = vi.mocked(updateComment);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);
const useCommentMentionSuggestionsMock = vi.mocked(useCommentMentionSuggestions);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

type RenderPanelOptions = {
  promptId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  initialThreadId?: string | null;
  initialCommentId?: string | null;
  highlightDurationMs?: number;
};

const defaultThread: CommentThread = {
  id: 'thread-1',
  promptId: 'prompt-1',
  createdBy: 'user-1',
  createdAt: '2024-05-01T00:00:00.000Z',
};

const defaultComment: Comment = {
  id: 'comment-1',
  promptId: 'prompt-1',
  threadId: 'thread-1',
  body: 'Initial comment body',
  mentions: [],
  createdBy: 'user-1',
  createdAt: '2024-05-01T00:00:00.000Z',
  updatedAt: '2024-05-01T00:00:00.000Z',
};

const renderPanel = ({
  promptId = 'prompt-1',
  userId = 'user-1',
  workspaceId = 'workspace-1',
  initialThreadId = null,
  initialCommentId = null,
  highlightDurationMs,
}: RenderPanelOptions = {}) => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <PromptCommentsPanel
        promptId={promptId}
        userId={userId}
        workspaceId={workspaceId}
        initialThreadId={initialThreadId}
        initialCommentId={initialCommentId}
        highlightDurationMs={highlightDurationMs}
      />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient, user, invalidateSpy };
};

describe('PromptCommentsPanel - thread creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchThreadCommentsMock.mockResolvedValue([] as Comment[]);
    fetchUserPlanIdMock.mockResolvedValue('plan-free');
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    createCommentMock.mockResolvedValue({} as Comment);
    deleteCommentMock.mockResolvedValue('comment-1');
    updateCommentMock.mockResolvedValue(defaultComment);
    useCommentMentionSuggestionsMock.mockImplementation(
      () =>
        ({
          data: [],
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }) as never,
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a thread, resets the form, and invalidates caches on success', async () => {
    const newThread: CommentThread = {
      id: 'thread-2',
      promptId: 'prompt-1',
      createdBy: 'user-1',
      createdAt: '2024-05-02T00:00:00.000Z',
    };

    createCommentThreadMock.mockResolvedValue(newThread);

    const { user, invalidateSpy } = renderPanel();

    await waitFor(() => {
      expect(fetchPlanLimitsMock).toHaveBeenCalled();
    });

    const threadTextarea = await screen.findByLabelText('Start a new discussion');
    await user.clear(threadTextarea);
    await user.type(threadTextarea, 'Launch discussion thread ');

    await user.click(screen.getByRole('button', { name: 'Create thread' }));

    await waitFor(() => {
      expect(createCommentThreadMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        body: 'Launch discussion thread',
        mentions: [],
      });
    });

    expect(threadTextarea).toHaveValue('');

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Discussion started',
      description: 'A new thread has been created.',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['prompt-comments', 'prompt-1', 'threads', expect.objectContaining({ offset: 0, limit: 20 })],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['prompt-comments', 'prompt-1'],
    });
  });

  it('prevents thread creation when the plan limit evaluation fails', async () => {
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 1,
        value_str: null,
        value_json: null,
      },
    });

    const { user } = renderPanel();

    await waitFor(() => {
      expect(fetchPlanLimitsMock).toHaveBeenCalled();
    });

    const threadTextarea = await screen.findByLabelText('Start a new discussion');
    await user.type(threadTextarea, 'Follow-up ideas');

    await user.click(screen.getByRole('button', { name: 'Create thread' }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Plan limit reached',
        description: 'You have reached the limit of 1 threads per prompt on your current plan.',
      });
    });

    expect(screen.getByText('You have reached the limit of 1 threads per prompt on your current plan.')).toBeInTheDocument();
    expect(createCommentThreadMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('upgrade-dialog')).toBeInTheDocument();
  });

  it('surfaces Supabase plan limit errors and opens the upgrade dialog', async () => {
    const supabaseError = new SupabasePlanLimitError({
      message: 'Plan limit exceeded.',
      details: 'Plan limit reached.',
      hint: 'Upgrade to create more threads.',
      code: 'P0001',
    } as never);

    createCommentThreadMock.mockRejectedValue(supabaseError);

    const { user } = renderPanel();

    await waitFor(() => {
      expect(fetchPlanLimitsMock).toHaveBeenCalled();
    });

    const threadTextarea = await screen.findByLabelText('Start a new discussion');
    await user.type(threadTextarea, 'Unexpected failure scenario');

    await user.click(screen.getByRole('button', { name: 'Create thread' }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Plan limit reached',
        description: 'Plan limit reached.',
      });
    });

    expect(screen.getByText('Plan limit reached.')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-dialog')).toBeInTheDocument();
  });

  it('validates that the thread description is required', async () => {
    const { user } = renderPanel();

    await waitFor(() => {
      expect(fetchPlanLimitsMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: 'Create thread' }));

    expect(await screen.findByText('Thread description cannot be empty.')).toBeInTheDocument();
    expect(createCommentThreadMock).not.toHaveBeenCalled();
  });
});

describe('PromptCommentsPanel - comment editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchThreadCommentsMock.mockResolvedValue([defaultComment]);
    fetchUserPlanIdMock.mockResolvedValue('plan-free');
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    updateCommentMock.mockResolvedValue({
      ...defaultComment,
      body: 'Updated comment body',
      updatedAt: '2024-05-02T00:00:00.000Z',
    });
    deleteCommentMock.mockResolvedValue('comment-1');
    useCommentMentionSuggestionsMock.mockImplementation(
      () =>
        ({
          data: [],
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }) as never,
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('allows the author to edit a comment and updates the cache on success', async () => {
    const { user, queryClient } = renderPanel();

    expect(await screen.findByText('Initial comment body')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const editTextarea = await screen.findByDisplayValue('Initial comment body');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Updated comment body   ');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateCommentMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        threadId: 'thread-1',
        commentId: 'comment-1',
        userId: 'user-1',
        body: 'Updated comment body',
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<InfiniteData<Comment[]>>([
        'prompt-comments',
        'prompt-1',
        'threads',
        'thread-1',
        'comments',
        { offset: 0, limit: 50 },
      ]);
      expect(cached?.pages[0]?.[0]?.body).toBe('Updated comment body');
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    await waitFor(() => {
      const [firstComment] = screen.getAllByRole('listitem');
      expect(firstComment).toHaveTextContent('Updated comment body');
    });

  });

  it('shows an error and restores the comment when the update fails', async () => {
    const error = new Error('You do not have permission to edit this comment.');
    updateCommentMock.mockRejectedValueOnce(error);

    const { user, queryClient } = renderPanel();

    expect(await screen.findByText('Initial comment body')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const editTextarea = await screen.findByDisplayValue('Initial comment body');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Unauthorized edit');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateCommentMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('You do not have permission to edit this comment.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Unauthorized edit')).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Failed to update comment',
      description: 'You do not have permission to edit this comment.',
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<InfiniteData<Comment[]>>([
        'prompt-comments',
        'prompt-1',
        'threads',
        'thread-1',
        'comments',
        { offset: 0, limit: 50 },
      ]);
      expect(cached?.pages[0]?.[0]?.body).toBe('Initial comment body');
    });
  });

  it('cancels editing and restores the original comment text', async () => {
    const { user } = renderPanel();

    expect(await screen.findByText('Initial comment body')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const editTextarea = await screen.findByDisplayValue('Initial comment body');
    await user.clear(editTextarea);
    await user.type(editTextarea, 'Draft edit text');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('Initial comment body')).toBeInTheDocument();
    expect(updateCommentMock).not.toHaveBeenCalled();
  });
});

describe('PromptCommentsPanel - mention highlighting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchThreadCommentsMock.mockResolvedValue([defaultComment]);
    fetchUserPlanIdMock.mockResolvedValue('plan-free');
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    useCommentMentionSuggestionsMock.mockImplementation(
      () =>
        ({
          data: [],
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }) as never,
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('scrolls to the initial comment and highlights it', async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock as never;

    await act(async () => {
      renderPanel({
        initialThreadId: 'thread-1',
        initialCommentId: 'comment-1',
        highlightDurationMs: 200,
      });
    });

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });

    const commentBody = await screen.findByText('Initial comment body');
    const listItem = commentBody.closest('li');
    expect(listItem).not.toBeNull();
    expect(listItem).toHaveAttribute('data-highlighted', 'true');

    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('removes the highlight after the timeout elapses', async () => {
    await act(async () => {
      renderPanel({
        initialThreadId: 'thread-1',
        initialCommentId: 'comment-1',
        highlightDurationMs: 200,
      });
    });

    const commentBody = await screen.findByText('Initial comment body');
    const listItem = commentBody.closest('li');
    expect(listItem).not.toBeNull();

    await waitFor(() => {
      expect(listItem).toHaveAttribute('data-highlighted', 'true');
    });

    await waitFor(() => {
      expect(listItem).not.toHaveAttribute('data-highlighted');
    });
  });

  it('clears the highlight when the initial comment ID is removed', async () => {
    let renderResult: ReturnType<typeof renderPanel> | undefined;

    await act(async () => {
      renderResult = renderPanel({
        initialThreadId: 'thread-1',
        initialCommentId: 'comment-1',
        highlightDurationMs: 5000,
      });
    });

    const { rerender, queryClient } = renderResult!;

    const commentBody = await screen.findByText('Initial comment body');
    const listItem = commentBody.closest('li');
    expect(listItem).not.toBeNull();

    await waitFor(() => {
      expect(listItem).toHaveAttribute('data-highlighted', 'true');
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <PromptCommentsPanel
          promptId="prompt-1"
          userId="user-1"
          workspaceId="workspace-1"
          initialThreadId="thread-1"
          initialCommentId={null}
          highlightDurationMs={5000}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(listItem).not.toHaveAttribute('data-highlighted');
    });
  });
});

describe('PromptCommentsPanel - mentions', () => {
  const teammateSuggestion = {
    id: 'user-2',
    name: 'Alex Example',
    email: 'alex@example.com',
    avatarUrl: null,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchThreadCommentsMock.mockResolvedValue([] as Comment[]);
    fetchUserPlanIdMock.mockResolvedValue('plan-free');
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    createCommentThreadMock.mockResolvedValue({
      ...defaultThread,
      id: 'thread-2',
      createdAt: '2024-05-02T00:00:00.000Z',
    });
    createCommentMock.mockResolvedValue({
      ...defaultComment,
      id: 'comment-2',
      body: 'Hello teammates',
      mentions: ['user-2'],
      createdAt: '2024-05-02T00:00:00.000Z',
      updatedAt: '2024-05-02T00:00:00.000Z',
    });
    deleteCommentMock.mockResolvedValue('comment-1');
    updateCommentMock.mockResolvedValue(defaultComment);
    useCommentMentionSuggestionsMock.mockImplementation((params) =>
      ({
        data: params?.search ? [teammateSuggestion] : [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }) as never,
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('submits a comment with mentions and keeps them during the optimistic update', async () => {
    const { user, queryClient } = renderPanel();

    const commentTextarea = await screen.findByLabelText('Add a comment');
    const mentionInputs = screen.getAllByLabelText('Mention teammates (optional)');
    const commentMentionInput = mentionInputs[1] as HTMLInputElement;

    await waitFor(() => {
      expect(commentMentionInput).not.toBeDisabled();
    });

    await user.type(commentMentionInput, '@alex');

    const mentionOption = await screen.findByRole('option', { name: /Alex Example/i });
    const mentionOptionButton = within(mentionOption).getByRole('button', { name: /Alex Example/i });
    await user.click(mentionOptionButton);

    await waitFor(() => {
      expect(screen.getByText('Alex Example')).toBeInTheDocument();
    });

    await user.type(commentTextarea, 'Hello teammates  ');

    createCommentMock.mockImplementation(async (params) => {
      const mentions = params.mentions ?? [];
      const cached = queryClient.getQueryData<InfiniteData<Comment[]>>([
        'prompt-comments',
        'prompt-1',
        'threads',
        'thread-1',
        'comments',
        { offset: 0, limit: 50 },
      ]);

      const optimisticComment = cached?.pages?.[0]?.slice(-1)?.[0];
      expect(optimisticComment?.mentions).toEqual(['user-2']);

      return {
        ...defaultComment,
        id: 'comment-2',
        threadId: 'thread-1',
        body: params.body,
        mentions,
        createdAt: '2024-05-02T00:00:00.000Z',
        updatedAt: '2024-05-02T00:00:00.000Z',
      } satisfies Comment;
    });

    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(createCommentMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        threadId: 'thread-1',
        userId: 'user-1',
        body: 'Hello teammates',
        mentions: ['user-2'],
      });
    });

    await waitFor(() => {
      expect(commentMentionInput).toHaveValue('');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('comment-mentions-selected')).not.toBeInTheDocument();
    });
  });

  it('submits a thread with mentions', async () => {
    const { user } = renderPanel();

    await waitFor(() => {
      expect(fetchPlanLimitsMock).toHaveBeenCalled();
    });

    const threadTextarea = await screen.findByLabelText('Start a new discussion');
    const mentionInputs = screen.getAllByLabelText('Mention teammates (optional)');
    const threadMentionInput = mentionInputs[0] as HTMLInputElement;

    await waitFor(() => {
      expect(threadMentionInput).not.toBeDisabled();
    });

    await user.type(threadMentionInput, '@alex');

    const mentionOption = await screen.findByRole('option', { name: /Alex Example/i });
    const mentionOptionButton = within(mentionOption).getByRole('button', { name: /Alex Example/i });
    await user.click(mentionOptionButton);

    await user.type(threadTextarea, 'Thread kickoff  ');

    await user.click(screen.getByRole('button', { name: 'Create thread' }));

    await waitFor(() => {
      expect(createCommentThreadMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        body: 'Thread kickoff',
        mentions: ['user-2'],
      });
    });

    await waitFor(() => {
      expect(threadMentionInput).toHaveValue('');
    });
  });
});

describe('PromptCommentsPanel - pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPromptCommentThreadsMock.mockResolvedValue([defaultThread]);
    fetchThreadCommentsMock.mockResolvedValue([defaultComment]);
    fetchUserPlanIdMock.mockResolvedValue('plan-free');
    fetchPlanLimitsMock.mockResolvedValue({
      comment_threads_per_prompt: {
        key: 'comment_threads_per_prompt',
        value_int: 100,
        value_str: null,
        value_json: null,
      },
    });
    createCommentThreadMock.mockResolvedValue(defaultThread);
    createCommentMock.mockResolvedValue(defaultComment);
    deleteCommentMock.mockResolvedValue('comment-1');
    updateCommentMock.mockResolvedValue(defaultComment);
    useCommentMentionSuggestionsMock.mockImplementation(
      () =>
        ({
          data: [],
          isLoading: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }) as never,
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('loads additional comments when clicking Load more comments', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...defaultComment,
      id: `comment-${index}`,
      body: `Comment ${index}`,
      createdAt: `2024-05-01T00:00:${String(index).padStart(2, '0')}.000Z`,
      updatedAt: `2024-05-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    }));

    const secondPage = [
      {
        ...defaultComment,
        id: 'comment-50',
        body: 'Second page comment',
        createdAt: '2024-05-02T00:00:00.000Z',
        updatedAt: '2024-05-02T00:00:00.000Z',
      },
    ];

    fetchThreadCommentsMock.mockImplementation(async ({ offset }) => {
      if (offset === 0) {
        return firstPage;
      }

      if (offset === 50) {
        return secondPage;
      }

      return [];
    });

    const { user, queryClient } = renderPanel();

    const loadMoreButton = await screen.findByRole('button', { name: 'Load more comments' });
    await user.click(loadMoreButton);

    await waitFor(() => {
      expect(fetchThreadCommentsMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        threadId: 'thread-1',
        offset: 50,
        limit: 50,
      });
    });

    expect(await screen.findByText('Second page comment')).toBeInTheDocument();

    await waitFor(() => {
      const cached = queryClient.getQueryData<InfiniteData<Comment[]>>([
        'prompt-comments',
        'prompt-1',
        'threads',
        'thread-1',
        'comments',
        { offset: 0, limit: 50 },
      ]);

      expect(cached?.pages.flat().length).toBe(51);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more comments' })).not.toBeInTheDocument();
    });

    expect(await screen.findByText('You have reached the end of the thread.')).toBeInTheDocument();
  });

  it('fetches the next page of discussions when Load more discussions is clicked', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...defaultThread,
      id: `thread-${index}`,
      createdAt: `2024-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));

    const secondPage = [
      {
        ...defaultThread,
        id: 'thread-20',
        createdAt: '2024-06-01T00:00:00.000Z',
      },
    ];

    fetchPromptCommentThreadsMock.mockImplementation(async ({ offset }) => {
      if (offset === 0) {
        return firstPage;
      }

      if (offset === 20) {
        return secondPage;
      }

      return [];
    });

    fetchThreadCommentsMock.mockResolvedValue([]);

    const { user, queryClient } = renderPanel();

    const loadMoreButton = await screen.findByRole('button', { name: 'Load more discussions' });
    await user.click(loadMoreButton);

    await waitFor(() => {
      expect(fetchPromptCommentThreadsMock).toHaveBeenCalledWith({
        promptId: 'prompt-1',
        offset: 20,
        limit: 20,
      });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<InfiniteData<CommentThread[]>>([
        'prompt-comments',
        'prompt-1',
        'threads',
        { offset: 0, limit: 20 },
      ]);

      expect(cached?.pages.flat().length).toBe(21);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more discussions' })).not.toBeInTheDocument();
    });

    expect(await screen.findByText('You have reached the end of discussions.')).toBeInTheDocument();
  });

  it('allows retrying a failed comments fetch', async () => {
    fetchThreadCommentsMock.mockRejectedValueOnce(new Error('Network error'));
    fetchThreadCommentsMock.mockResolvedValueOnce([defaultComment]);

    const { user } = renderPanel();

    expect(
      await screen.findByText('Failed to load comments. Please try again.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(fetchThreadCommentsMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Initial comment body')).toBeInTheDocument();
  });
});

