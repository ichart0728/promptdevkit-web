import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import {
  commentThreadCommentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  createCommentThread,
  deleteComment,
  fetchPromptCommentThreads,
  fetchThreadComments,
  promptCommentsQueryKey,
  SupabasePlanLimitError,
  type Comment,
  type CommentThread,
} from '../api/promptComments';
import {
  fetchPlanLimits,
  fetchUserPlanId,
  planLimitsQueryKey,
  userPlanQueryKey,
} from '../api/planLimits';
import {
  evaluateIntegerPlanLimit,
  PlanLimitError,
  type IntegerPlanLimitEvaluation,
  type PlanLimitMap,
} from '@/lib/limits';

const THREADS_PAGINATION = { offset: 0, limit: 20 } as const;
const COMMENTS_PAGINATION = { offset: 0, limit: 50 } as const;
const THREAD_LIMIT_KEY = 'comment_threads_per_prompt';

const commentFormSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty.'),
});

const threadFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Thread description cannot be empty.'),
});

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.error(error);
    return timestamp;
  }
};

const buildPlanLimitMessage = (evaluation: IntegerPlanLimitEvaluation) => {
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

const buildThreadLimitMessage = (evaluation: IntegerPlanLimitEvaluation) => {
  if (evaluation.limitValue && evaluation.limitValue > 0) {
    return `You have reached the limit of ${evaluation.limitValue} threads per prompt on your current plan.`;
  }

  return 'Your current plan does not allow creating additional threads for this prompt.';
};

const buildSupabasePlanLimitMessage = (error: SupabasePlanLimitError) =>
  error.detail ?? error.message ?? 'Your current plan does not allow this action.';

export type PromptCommentsPanelProps = {
  promptId: string | null;
  userId: string | null;
};

type CommentFormValues = z.infer<typeof commentFormSchema>;
type ThreadFormValues = z.infer<typeof threadFormSchema>;

type CreateOptimisticContext = {
  previousComments: Comment[];
  queryKey: ReturnType<typeof commentThreadCommentsQueryKey>;
  optimisticId: string;
};

type DeleteOptimisticContext = {
  previousComments: Comment[];
  queryKey: ReturnType<typeof commentThreadCommentsQueryKey>;
};

export const PromptCommentsPanel = ({ promptId, userId }: PromptCommentsPanelProps) => {
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [commentsError, setCommentsError] = React.useState<string | null>(null);
  const [threadFormError, setThreadFormError] = React.useState<string | null>(null);
  const [threadEvaluation, setThreadEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = React.useState(false);

  const commentForm = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: '' },
  });

  const threadForm = useForm<ThreadFormValues>({
    resolver: zodResolver(threadFormSchema),
    defaultValues: { body: '' },
  });

  React.useEffect(() => {
    setActiveThreadId(null);
    setFormError(null);
    setCommentsError(null);
    setThreadFormError(null);
    setThreadEvaluation(null);
    setIsUpgradeDialogOpen(false);
    commentForm.reset({ body: '' });
    threadForm.reset({ body: '' });
  }, [promptId, commentForm, threadForm]);

  const userPlanQuery = useQuery({
    queryKey: userPlanQueryKey(userId ?? null),
    queryFn: () => {
      if (!userId) {
        throw new Error('You must be signed in to evaluate plan limits.');
      }

      return fetchUserPlanId({ userId });
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const planId = userPlanQuery.data ?? null;

  const planLimitsQueryKeyValue = React.useMemo(
    () => (planId ? planLimitsQueryKey(planId) : null),
    [planId],
  );

  const planLimitsQuery = useQuery({
    queryKey: planLimitsQueryKeyValue ?? (['plan-limits', 'unknown-plan'] as const),
    queryFn: () => {
      if (!planId) {
        throw new Error('Plan ID is required to resolve plan limits.');
      }

      return fetchPlanLimits({ planId });
    },
    enabled: !!planId,
    staleTime: 5 * 60 * 1000,
  });

  const planLimits = (planLimitsQuery.data ?? null) as PlanLimitMap | null;
  const planLimitRecord = planLimits?.[THREAD_LIMIT_KEY] ?? null;

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

      commentForm.reset({ body: values.body });

      if (error instanceof PlanLimitError) {
        const message = buildPlanLimitMessage(error.evaluation);
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
      commentForm.reset({ body: '' });
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

  const createThreadMutation = useMutation<CommentThread, Error, { body: string }>({
    mutationFn: async ({ body }) => {
      if (!promptId) {
        throw new Error('Select a prompt before starting a discussion.');
      }

      if (!userId) {
        throw new Error('You must be signed in to create a discussion thread.');
      }

      return createCommentThread({ promptId, body });
    },
    onSuccess: async (thread) => {
      if (!promptId) {
        return;
      }

      const threadsKey = commentThreadsQueryKey(promptId, THREADS_PAGINATION);
      queryClient.setQueryData<CommentThread[]>(threadsKey, (current = []) => {
        const existing = current.filter((item) => item.id !== thread.id);
        return [thread, ...existing];
      });

      setActiveThreadId(thread.id);
      setThreadFormError(null);
      setThreadEvaluation(null);
      setIsUpgradeDialogOpen(false);
      threadForm.reset({ body: '' });

      toast({ title: 'Discussion started', description: 'A new thread has been created.' });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: threadsKey }),
        queryClient.invalidateQueries({ queryKey: promptCommentsQueryKey(promptId) }),
      ]);
    },
    onError: (error) => {
      if (error instanceof PlanLimitError) {
        const message = buildThreadLimitMessage(error.evaluation);
        setThreadEvaluation(error.evaluation);
        setThreadFormError(message);
        setIsUpgradeDialogOpen(true);
        toast({ title: 'Plan limit reached', description: message });
        return;
      }

      if (error instanceof SupabasePlanLimitError) {
        const message = buildSupabasePlanLimitMessage(error);
        setThreadFormError(message);
        setIsUpgradeDialogOpen(true);
        toast({ title: 'Plan limit reached', description: message });
        return;
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setThreadFormError(error.message);
        return;
      }

      setThreadFormError('Failed to create the discussion thread. Please try again.');
      console.error(error);
    },
  });

  const handleCommentSubmit = commentForm.handleSubmit(async (values) => {
    try {
      await createCommentMutation.mutateAsync(values);
    } catch (error) {
      console.error(error);
    }
  });

  const handleThreadSubmit = threadForm.handleSubmit(async (values) => {
    setThreadFormError(null);

    if (!promptId) {
      setThreadFormError('Select a prompt before starting a discussion.');
      return;
    }

    if (!userId) {
      setThreadFormError('You must be signed in to create a discussion thread.');
      return;
    }

    if (userPlanQuery.status === 'pending' || planLimitsQuery.status === 'pending') {
      setThreadFormError('Plan information is still loading. Please wait and try again.');
      return;
    }

    if (userPlanQuery.status === 'error') {
      const message =
        userPlanQuery.error instanceof Error
          ? userPlanQuery.error.message
          : 'Failed to determine your subscription plan. Please reload the page and try again.';
      setThreadFormError(message);
      return;
    }

    if (planLimitsQuery.status === 'error' || !planLimits) {
      const message =
        planLimitsQuery.error instanceof Error
          ? planLimitsQuery.error.message
          : 'Plan limits are unavailable. Please reload the page and try again.';
      setThreadFormError(message);
      return;
    }

    const trimmedBody = values.body.trim();
    const currentThreads = (threadsQuery.data ?? []) as CommentThread[];
    const evaluation = evaluateIntegerPlanLimit({
      limits: planLimits,
      key: THREAD_LIMIT_KEY,
      currentUsage: currentThreads.length,
    });

    setThreadEvaluation(evaluation);

    if (!evaluation.allowed) {
      const message = buildThreadLimitMessage(evaluation);
      setThreadFormError(message);
      setIsUpgradeDialogOpen(true);
      toast({ title: 'Plan limit reached', description: message });
      return;
    }

    try {
      await createThreadMutation.mutateAsync({ body: trimmedBody });
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

  const planInfoError = React.useMemo(() => {
    if (userPlanQuery.status === 'error') {
      const error = userPlanQuery.error;
      return error instanceof Error
        ? error.message
        : 'Failed to determine your subscription plan. Please reload and try again.';
    }

    if (planLimitsQuery.status === 'error') {
      const error = planLimitsQuery.error;
      return error instanceof Error
        ? error.message
        : 'Plan limits are unavailable. Please reload and try again.';
    }

    return null;
  }, [planLimitsQuery.error, planLimitsQuery.status, userPlanQuery.error, userPlanQuery.status]);

  const threadsCount = (threadsQuery.data ?? []).length;

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
          const canDelete = userId && comment.createdBy === userId;

          return (
            <li key={comment.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{comment.createdBy}</span>
                <span className="text-xs text-muted-foreground">{formatTimestamp(comment.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
              {canDelete ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={handleThreadSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="prompt-thread-body">
            Start a new discussion
          </label>
          <textarea
            id="prompt-thread-body"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...threadForm.register('body')}
            aria-invalid={Boolean(threadForm.formState.errors.body || threadFormError)}
            aria-describedby={
              [
                threadForm.formState.errors.body ? 'prompt-thread-body-error' : null,
                threadFormError ? 'prompt-thread-root-error' : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {threadForm.formState.errors.body ? (
            <p id="prompt-thread-body-error" className="text-xs text-destructive">
              {threadForm.formState.errors.body.message}
            </p>
          ) : null}
          {threadFormError ? (
            <p id="prompt-thread-root-error" className="text-xs text-destructive">
              {threadFormError}
            </p>
          ) : null}
          {planInfoError ? (
            <p className="text-xs text-destructive">{planInfoError}</p>
          ) : null}
          {planLimitRecord ? (
            <p className="text-xs text-muted-foreground">
              {`Your plan allows up to ${
                planLimitRecord.value_int === null ? 'an unlimited number of' : planLimitRecord.value_int
              } threads per prompt. Currently using ${threadsCount}.`}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          {threadEvaluation?.shouldRecommendUpgrade ? (
            <Button type="button" variant="outline" onClick={() => setIsUpgradeDialogOpen(true)}>
              View upgrade options
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={
              createThreadMutation.isPending ||
              !promptId ||
              !userId ||
              threadsQuery.status === 'pending' ||
              userPlanQuery.status === 'pending' ||
              planLimitsQuery.status === 'pending'
            }
          >
            {createThreadMutation.isPending ? 'Creating…' : 'Create thread'}
          </Button>
        </div>
      </form>

      <div>{renderThreads()}</div>

      <div>{renderComments()}</div>

      <form className="space-y-3" onSubmit={handleCommentSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="prompt-comment-body">
            Add a comment
          </label>
          <textarea
            id="prompt-comment-body"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            {...commentForm.register('body')}
          />
          {commentForm.formState.errors.body ? (
            <p className="text-xs text-destructive">{commentForm.formState.errors.body.message}</p>
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

      <UpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={setIsUpgradeDialogOpen}
        evaluation={threadEvaluation}
        onResetEvaluation={() => setThreadEvaluation(null)}
      />
    </div>
  );
};
