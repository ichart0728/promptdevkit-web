import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptCommentsPanel } from '../PromptCommentsPanel';
import {
  createComment,
  createCommentThread,
  deleteComment,
  fetchPromptCommentThreads,
  fetchThreadComments,
  SupabasePlanLimitError,
  type Comment,
  type CommentThread,
} from '../../api/promptComments';
import { fetchPlanLimits, fetchUserPlanId } from '../../api/planLimits';
import type * as ToastModule from '@/components/common/toast';

vi.mock('../../api/promptComments', () => ({
  fetchPromptCommentThreads: vi.fn(),
  fetchThreadComments: vi.fn(),
  createComment: vi.fn(),
  createCommentThread: vi.fn(),
  deleteComment: vi.fn(),
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

const fetchPromptCommentThreadsMock = vi.mocked(fetchPromptCommentThreads);
const fetchThreadCommentsMock = vi.mocked(fetchThreadComments);
const createCommentMock = vi.mocked(createComment);
const createCommentThreadMock = vi.mocked(createCommentThread);
const deleteCommentMock = vi.mocked(deleteComment);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);

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
};

const defaultThread: CommentThread = {
  id: 'thread-1',
  promptId: 'prompt-1',
  createdBy: 'user-1',
  createdAt: '2024-05-01T00:00:00.000Z',
};

const renderPanel = ({ promptId = 'prompt-1', userId = 'user-1' }: RenderPanelOptions = {}) => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <PromptCommentsPanel promptId={promptId} userId={userId} />
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

