import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import {
  commentThreadCommentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  deleteComment,
  updateComment,
  fetchPromptCommentThreads,
  fetchThreadComments,
  promptCommentsQueryKey,
  type Comment,
  type CommentThread,
} from '../api/promptComments';
import { evaluateIntegerPlanLimit, PlanLimitError } from '@/lib/limits';

const THREADS_PAGINATION = { offset: 0, limit: 20 } as const;
const COMMENTS_PAGINATION = { offset: 0, limit: 50 } as const;

const commentFormSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty.'),
});

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.error(error);
    return timestamp;
  }
};

const buildPlanLimitMessage = (error: PlanLimitError) => {
  const evaluation = error.evaluation;
  const { key, currentUsage, delta, limitValue } = evaluation;
  const derivedEvaluation = evaluateIntegerPlanLimit({
    limits: [
      {
        key,
        value_int: typeof limitValue === 'number' ? limitValue : null,
        value_str: null,
        value_json: null,
      },
    ],
    key,
    currentUsage,
    delta,
  });

  if (derivedEvaluation.status === 'limit-exceeded') {
    if (typeof derivedEvaluation.limitValue === 'number') {
      return `You have reached the limit of ${derivedEvaluation.limitValue} comments for your plan.`;
    }

    return 'Your current plan does not allow posting additional comments.';
  }

  if (derivedEvaluation.status === 'limit-reached') {
    if (typeof derivedEvaluation.limitValue === 'number') {
      return `Posting this comment would reach your plan limit of ${derivedEvaluation.limitValue}.`;
    }

    return 'Posting this comment would reach your plan limit.';
  }

  return 'Your current plan does not allow posting comments.';
};

export type PromptCommentsPanelProps = {
  promptId: string | null;
  userId: string | null;
};

type CommentFormValues = z.infer<typeof commentFormSchema>;

type CreateOptimisticContext = {
  previousComments: Comment[];
  queryKey: ReturnType<typeof commentThreadCommentsQueryKey>;
  optimisticId: string;
};

type DeleteOptimisticContext = {
  previousComments: Comment[];
  queryKey: ReturnType<typeof commentThreadCommentsQueryKey>;
};

type UpdateOptimisticContext = {
  previousComments: Comment[];
  queryKey: ReturnType<typeof commentThreadCommentsQueryKey>;
  originalComment: Comment | null;
};

export const PromptCommentsPanel = ({ promptId, userId }: PromptCommentsPanelProps) => {
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [commentsError, setCommentsError] = React.useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editingBody, setEditingBody] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);

  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: '' },
  });

  React.useEffect(() => {
    setActiveThreadId(null);
    setFormError(null);
    setCommentsError(null);
    setEditingCommentId(null);
    setEditingBody('');
    setEditError(null);
    form.reset({ body: '' });
  }, [promptId, form]);

  React.useEffect(() => {
    setEditingCommentId(null);
    setEditingBody('');
    setEditError(null);
  }, [activeThreadId]);

  const threadsQuery = useQuery({
    queryKey: commentThreadsQueryKey(promptId, THREADS_PAGINATION),
    queryFn: () => {
      if (!promptId) {
        throw new Error('Prompt ID is required to fetch threads.');
      }

      return fetchPromptCommentThreads({ promptId, ...THREADS_PAGINATION });
    },
    enabled: !!promptId,
    staleTime: 60 * 1000,
  });

  React.useEffect(() => {
    if (!threadsQuery.data || !threadsQuery.data.length) {
      return;
    }

    if (!activeThreadId) {
      setActiveThreadId(threadsQuery.data[0]?.id ?? null);
    } else if (!threadsQuery.data.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(threadsQuery.data[0]?.id ?? null);
    }
  }, [activeThreadId, threadsQuery.data]);

  const commentsQuery = useQuery({
    queryKey: commentThreadCommentsQueryKey(promptId, activeThreadId, COMMENTS_PAGINATION),
    queryFn: () => {
      if (!promptId || !activeThreadId) {
        throw new Error('Prompt and thread IDs are required to fetch comments.');
      }

      return fetchThreadComments({ promptId, threadId: activeThreadId, ...COMMENTS_PAGINATION });
    },
    enabled: !!promptId && !!activeThreadId,
    staleTime: 30 * 1000,
  });

  const createCommentMutation = useMutation<Comment, Error, CommentFormValues, CreateOptimisticContext>({
    mutationFn: async (values) => {
      if (!promptId) {
        throw new Error('No prompt selected.');
      }

      if (!activeThreadId) {
        throw new Error('No active comment thread.');
      }

      if (!userId) {
        throw new Error('You must be signed in to post comments.');
      }

      return createComment({
        promptId,
        threadId: activeThreadId,
        userId,
        body: values.body.trim(),
      });
    },
    onMutate: async (values) => {
      if (!promptId || !activeThreadId) {
        throw new Error('Prompt and thread must be available for optimistic updates.');
      }

      const queryKey = commentThreadCommentsQueryKey(promptId, activeThreadId, COMMENTS_PAGINATION);

      setFormError(null);
      setCommentsError(null);

      await queryClient.cancelQueries({ queryKey });

      const previousComments =
        queryClient.getQueryData<Comment[]>(queryKey) ?? [];

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticComment: Comment = {
        id: optimisticId,
        promptId,
        threadId: activeThreadId,
        body: values.body.trim(),
        mentions: [],
        createdBy: userId ?? 'anonymous',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Comment[]>(queryKey, [...previousComments, optimisticComment]);

      return { previousComments, queryKey, optimisticId } satisfies CreateOptimisticContext;
    },
    onError: (error, values, context) => {
      if (context) {
        queryClient.setQueryData<Comment[]>(context.queryKey, context.previousComments);
      }

      form.reset({ body: values.body });

      if (error instanceof PlanLimitError) {
        const message = buildPlanLimitMessage(error);
        setFormError(message);
        toast({ title: 'Plan limit reached', description: message });
        return;
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setFormError(error.message);
        return;
      }

      setFormError('Failed to post comment. Please try again.');
      console.error(error);
    },
    onSuccess: (newComment, _values, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData<Comment[]>(context.queryKey, (current = []) =>
        current.map((comment) => (comment.id === context.optimisticId ? newComment : comment)),
      );
      form.reset({ body: '' });
      queryClient.invalidateQueries({ queryKey: promptCommentsQueryKey(promptId) });
    },
  });

  const deleteCommentMutation = useMutation<string, Error, { commentId: string }, DeleteOptimisticContext>({
    mutationFn: async ({ commentId }) => {
      if (!promptId) {
        throw new Error('No prompt selected.');
      }

      if (!activeThreadId) {
        throw new Error('No active comment thread.');
      }

      if (!userId) {
        throw new Error('You must be signed in to delete comments.');
      }

      return deleteComment({
        promptId,
        threadId: activeThreadId,
        commentId,
        userId,
      });
    },
    onMutate: async (variables) => {
      if (!promptId || !activeThreadId) {
        throw new Error('Prompt and thread must be available for optimistic updates.');
      }

      const queryKey = commentThreadCommentsQueryKey(promptId, activeThreadId, COMMENTS_PAGINATION);

      setCommentsError(null);

      await queryClient.cancelQueries({ queryKey });

      const previousComments =
        queryClient.getQueryData<Comment[]>(queryKey) ?? [];

      queryClient.setQueryData<Comment[]>(
        queryKey,
        previousComments.filter((comment) => comment.id !== variables.commentId),
      );

      return { previousComments, queryKey } satisfies DeleteOptimisticContext;
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData<Comment[]>(context.queryKey, context.previousComments);
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setCommentsError(error.message);
        return;
      }

      setCommentsError('Failed to delete comment. Please try again.');
      console.error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promptCommentsQueryKey(promptId) });
    },
  });

  const updateCommentMutation = useMutation<
    Comment,
    Error,
    { commentId: string; body: string },
    UpdateOptimisticContext
  >({
    mutationFn: async ({ commentId, body }) => {
      if (!promptId) {
        throw new Error('No prompt selected.');
      }

      if (!activeThreadId) {
        throw new Error('No active comment thread.');
      }

      if (!userId) {
        throw new Error('You must be signed in to edit comments.');
      }

      const trimmedBody = body.trim();

      if (!trimmedBody) {
        throw new Error('Comment cannot be empty.');
      }

      return updateComment({
        promptId,
        threadId: activeThreadId,
        commentId,
        userId,
        body: trimmedBody,
      });
    },
    onMutate: async ({ commentId, body }) => {
      if (!promptId || !activeThreadId) {
        throw new Error('Prompt and thread must be available for optimistic updates.');
      }

      const queryKey = commentThreadCommentsQueryKey(promptId, activeThreadId, COMMENTS_PAGINATION);

      setEditError(null);

      await queryClient.cancelQueries({ queryKey });

      const previousComments = queryClient.getQueryData<Comment[]>(queryKey) ?? [];
      const originalComment = previousComments.find((comment) => comment.id === commentId) ?? null;

      if (!originalComment) {
        return { previousComments, queryKey, originalComment } satisfies UpdateOptimisticContext;
      }

      const optimisticComment: Comment = {
        ...originalComment,
        body: body.trim(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Comment[]>(queryKey, (current = []) =>
        current.map((comment) => (comment.id === commentId ? optimisticComment : comment)),
      );

      return { previousComments, queryKey, originalComment } satisfies UpdateOptimisticContext;
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData<Comment[]>(context.queryKey, context.previousComments);
        if (context.originalComment) {
          setEditingBody(context.originalComment.body);
        }
      }

      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to update comment. Please try again.';

      setEditError(message);
      toast({ title: 'Comment update failed', description: message });
    },
    onSuccess: (updatedComment, _variables, context) => {
      if (context) {
        queryClient.setQueryData<Comment[]>(context.queryKey, (current = []) =>
          current.map((comment) => (comment.id === updatedComment.id ? updatedComment : comment)),
        );
      }

      setEditingCommentId(null);
      setEditingBody('');
      setEditError(null);

      queryClient.invalidateQueries({ queryKey: promptCommentsQueryKey(promptId) });
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await createCommentMutation.mutateAsync(values);
    } catch (error) {
      console.error(error);
    }
  });

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteCommentMutation.mutateAsync({ commentId });
    } catch (error) {
      console.error(error);
    }
  };

  const handleStartEditing = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
    setEditError(null);
  };

  const handleCancelEditing = () => {
    setEditingCommentId(null);
    setEditingBody('');
    setEditError(null);
  };

  const handleSaveEditing = async (commentId: string) => {
    const trimmedBody = editingBody.trim();

    if (!trimmedBody) {
      setEditError('Comment cannot be empty.');
      return;
    }

    if (!commentsQuery.data) {
      return;
    }

    const existingComment = commentsQuery.data.find((comment) => comment.id === commentId);

    if (existingComment && existingComment.body.trim() === trimmedBody) {
      handleCancelEditing();
      return;
    }

    try {
      await updateCommentMutation.mutateAsync({ commentId, body: trimmedBody });
    } catch (error) {
      console.error(error);
    }
  };

  const renderThreads = () => {
    if (!promptId) {
      return <p className="text-sm text-muted-foreground">Select a prompt to view discussions.</p>;
    }

    if (threadsQuery.status === 'pending') {
      return <p className="text-sm text-muted-foreground">Loading discussions…</p>;
    }

    if (threadsQuery.status === 'error') {
      return (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">Failed to load discussions. Please try again.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => threadsQuery.refetch()}
            disabled={threadsQuery.isFetching}
          >
            Retry
          </Button>
        </div>
      );
    }

    const threads = (threadsQuery.data ?? []) as CommentThread[];

    if (!threads.length) {
      return <p className="text-sm text-muted-foreground">No discussions yet.</p>;
    }

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Threads</p>
        <div className="flex flex-wrap gap-2">
          {threads.map((thread) => {
            const isActive = activeThreadId === thread.id;
            return (
              <button
                key={thread.id}
                type="button"
                className={`rounded-md border px-3 py-1 text-sm ${
                  isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'
                }`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                {formatTimestamp(thread.createdAt)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderComments = () => {
    if (!promptId || !activeThreadId) {
      return null;
    }

    if (commentsQuery.status === 'pending') {
      return <p className="text-sm text-muted-foreground">Loading comments…</p>;
    }

    if (commentsQuery.status === 'error') {
      return (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">Failed to load comments. Please try again.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => commentsQuery.refetch()}
            disabled={commentsQuery.isFetching}
          >
            Retry
          </Button>
        </div>
      );
    }

    const comments = (commentsQuery.data ?? []) as Comment[];

    if (!comments.length) {
      return <p className="text-sm text-muted-foreground">No comments yet. Start the conversation!</p>;
    }

    return (
      <ul className="space-y-3">
        {comments.map((comment) => {
          const isDeleting =
            deleteCommentMutation.isPending && deleteCommentMutation.variables?.commentId === comment.id;
          const isUpdating =
            updateCommentMutation.isPending && updateCommentMutation.variables?.commentId === comment.id;
          const canDelete = userId && comment.createdBy === userId;
          const canEdit = canDelete;
          const isEditing = editingCommentId === comment.id;

          return (
            <li key={comment.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{comment.createdBy}</span>
                <span className="text-xs text-muted-foreground">{formatTimestamp(comment.createdAt)}</span>
              </div>
              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editingBody}
                    onChange={(event) => {
                      setEditingBody(event.target.value);
                      if (editError) {
                        setEditError(null);
                      }
                    }}
                    className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEditing}
                      disabled={isUpdating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveEditing(comment.id)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
                  {canEdit || canDelete ? (
                    <div className="mt-3 flex justify-end gap-2">
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEditing(comment)}
                          disabled={isDeleting}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-4">
      <div>{renderThreads()}</div>

      <div>{renderComments()}</div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="prompt-comment-body">
            Add a comment
          </label>
          <textarea
            id="prompt-comment-body"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...form.register('body')}
          />
          {form.formState.errors.body ? (
            <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
          ) : null}
        </div>

        {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        {commentsError ? <p className="text-xs text-destructive">{commentsError}</p> : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              createCommentMutation.isPending ||
              deleteCommentMutation.isPending ||
              !promptId ||
              !activeThreadId ||
              !userId
            }
          >
            {createCommentMutation.isPending ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </form>
    </div>
  );
};
