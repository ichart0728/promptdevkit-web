import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptCommentsPanel } from '../PromptCommentsPanel';
import {
  commentThreadCommentsQueryKey,
  fetchPromptCommentThreads,
  fetchThreadComments,
  promptCommentsQueryKey,
  updateComment,
  type Comment,
  type CommentThread,
} from '../../api/promptComments';
import type * as ToastModule from '@/components/common/toast';

vi.mock('../../api/promptComments', () => ({
  fetchPromptCommentThreads: vi.fn(),
  fetchThreadComments: vi.fn(),
  createComment: vi.fn(),
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
}));

type ToastFn = typeof ToastModule.toast;

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<ToastFn>) => toastMock(...args),
}));

const fetchPromptCommentThreadsMock = vi.mocked(fetchPromptCommentThreads);
const fetchThreadCommentsMock = vi.mocked(fetchThreadComments);
const updateCommentMock = vi.mocked(updateComment);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const promptId = 'prompt-1';
const threadId = 'thread-1';
const authorId = 'user-1';

const thread: CommentThread = {
  id: threadId,
  promptId,
  createdBy: authorId,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const baseComment: Comment = {
  id: 'comment-1',
  promptId,
  threadId,
  body: 'Initial comment body.',
  mentions: [],
  createdBy: authorId,
  createdAt: '2024-01-01T01:00:00.000Z',
  updatedAt: '2024-01-01T01:00:00.000Z',
};

const renderPromptCommentsPanel = () => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <PromptCommentsPanel promptId={promptId} userId={authorId} />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient, user, invalidateSpy };
};

describe('PromptCommentsPanel - editing comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchPromptCommentThreadsMock.mockResolvedValue([thread]);
    fetchThreadCommentsMock.mockResolvedValue([baseComment]);
  });

  afterEach(() => {
    cleanup();
  });

  it('allows the author to edit a comment with optimistic updates and cache invalidation', async () => {
    const updatedComment: Comment = {
      ...baseComment,
      body: 'Updated comment body.',
      updatedAt: '2024-01-01T02:00:00.000Z',
    };

    fetchThreadCommentsMock.mockReset();
    fetchThreadCommentsMock.mockResolvedValueOnce([baseComment]);
    fetchThreadCommentsMock.mockResolvedValue([updatedComment]);

    updateCommentMock.mockResolvedValue(updatedComment);

    const { user, queryClient, invalidateSpy } = renderPromptCommentsPanel();

    await screen.findByText('Initial comment body.');

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const textarea = screen.getByRole('textbox', { name: '' });
    expect(textarea).toHaveValue('Initial comment body.');

    await user.clear(textarea);
    await user.type(textarea, 'Updated comment body.');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateCommentMock).toHaveBeenCalledWith({
        promptId,
        threadId,
        commentId: baseComment.id,
        userId: authorId,
        body: 'Updated comment body.',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Updated comment body.')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    const commentsQueryKey = commentThreadCommentsQueryKey(promptId, threadId, {
      offset: 0,
      limit: 50,
    });

    const cachedComments = queryClient.getQueryData<Comment[]>(commentsQueryKey);
    expect(cachedComments).toEqual([updatedComment]);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: promptCommentsQueryKey(promptId) });
    });
  });

  it('reverts the optimistic update and shows an error toast when editing fails', async () => {
    const error = new Error('You do not have permission to edit this comment.');
    updateCommentMock.mockRejectedValue(error);

    const { user, queryClient } = renderPromptCommentsPanel();

    await screen.findByText('Initial comment body.');

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const textarea = screen.getByRole('textbox', { name: '' });
    await user.clear(textarea);
    await user.type(textarea, 'Attempted update.');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText('You do not have permission to edit this comment.')).toBeInTheDocument();
    });

    expect(textarea).toHaveValue('Initial comment body.');

    const commentsQueryKey = commentThreadCommentsQueryKey(promptId, threadId, {
      offset: 0,
      limit: 50,
    });

    const cachedComments = queryClient.getQueryData<Comment[]>(commentsQueryKey);
    expect(cachedComments).toEqual([baseComment]);

    expect(toastMock).toHaveBeenCalledWith({
      title: 'Comment update failed',
      description: 'You do not have permission to edit this comment.',
    });
  });

  it('cancels editing without calling the update mutation', async () => {
    const { user } = renderPromptCommentsPanel();

    await screen.findByText('Initial comment body.');

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const textarea = screen.getByRole('textbox', { name: '' });
    await user.type(textarea, ' - extra text');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('textbox', { name: '' })).not.toBeInTheDocument();
    expect(screen.getByText('Initial comment body.')).toBeInTheDocument();
    expect(updateCommentMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
