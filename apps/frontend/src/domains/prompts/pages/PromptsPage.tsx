import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  evaluateIntegerPlanLimit,
  type IntegerPlanLimitEvaluation,
  type PlanLimitMap,
} from '@/lib/limits';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { createPrompt, fetchPrompts, promptsQueryKey, type Prompt } from '../api/prompts';
import {
  fetchPlanLimits,
  fetchUserPlanId,
  planLimitsQueryKey,
  userPlanQueryKey,
} from '../api/planLimits';

const DEMO_PERSONAL_WORKSPACE_ID = '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf' as const;
const PROMPTS_PER_PERSONAL_WS_LIMIT_KEY = 'prompts_per_personal_ws';

const promptSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  tags: z.string().optional(),
});

export type PromptFormValues = z.infer<typeof promptSchema>;

type PromptListItem = Prompt & { isOptimistic?: boolean };

type OptimisticContext = {
  previousPrompts: PromptListItem[];
  optimisticId: string;
};

const formatTags = (raw: string | undefined) =>
  raw?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

const buildErrorMessage = (message?: string) =>
  `Failed to load prompts. ${message ?? 'Unknown error'}`;

export const PromptsPage = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const [simulateError, setSimulateError] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);

  const promptsKey = React.useMemo(() => promptsQueryKey(DEMO_PERSONAL_WORKSPACE_ID), []);
  const userId = sessionQuery.data?.user?.id ?? null;

  const promptsQuery = useQuery({
    queryKey: promptsKey,
    queryFn: () => fetchPrompts({ workspaceId: DEMO_PERSONAL_WORKSPACE_ID }),
    enabled: !!userId,
    retry: false,
  });

  const userPlanQuery = useQuery({
    queryKey: userPlanQueryKey(userId ?? null),
    queryFn: () =>
      userId
        ? fetchUserPlanId({ userId })
        : Promise.reject(new Error('Cannot determine plan without a user.')),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const planId = userPlanQuery.data ?? null;
  const isPlanLookupLoading = userPlanQuery.status === 'pending';
  const planLookupError = userPlanQuery.status === 'error';
  const planLookupErrorMessage = planLookupError ? userPlanQuery.error?.message : null;

  const planLimitsQueryKeyValue = React.useMemo(
    () => (planId ? planLimitsQueryKey(planId) : null),
    [planId],
  );

  const planLimitsQuery = useQuery({
    queryKey: planLimitsQueryKeyValue ?? (['plan-limits', 'unknown-plan'] as const),
    queryFn: () =>
      planId
        ? fetchPlanLimits({ planId })
        : Promise.reject(new Error('Plan ID is required to load plan limits.')),
    enabled: !!planId,
    staleTime: 5 * 60 * 1000,
  });

  const lastPlanContextRef = React.useRef<{ planId: string; workspaceId: string } | null>(null);

  React.useEffect(() => {
    if (!planId) {
      lastPlanContextRef.current = null;
      return;
    }

    const workspaceId = promptsKey[1];
    const lastContext = lastPlanContextRef.current;

    lastPlanContextRef.current = { planId, workspaceId };

    if (lastContext && (lastContext.planId !== planId || lastContext.workspaceId !== workspaceId)) {
      queryClient.invalidateQueries({ queryKey: planLimitsQueryKey(planId) });
    }
  }, [planId, promptsKey, queryClient]);

  const hasMountedRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!simulateError) {
      queryClient.invalidateQueries({ queryKey: promptsKey });
    }
  }, [simulateError, queryClient, promptsKey]);

  const createPromptMutation = useMutation<Prompt, Error, PromptFormValues, OptimisticContext>({
    mutationFn: async (values) => {
      if (!userId) {
        throw new Error('You must be signed in to create prompts.');
      }

      return createPrompt({
        workspaceId: DEMO_PERSONAL_WORKSPACE_ID,
        userId,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
      });
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: promptsKey });
      const previousPrompts = queryClient.getQueryData<PromptListItem[]>(promptsKey) ?? [];
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticPrompt: PromptListItem = {
        id: optimisticId,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
        isOptimistic: true,
      };

      queryClient.setQueryData<PromptListItem[]>(promptsKey, [...previousPrompts, optimisticPrompt]);

      return { previousPrompts, optimisticId } satisfies OptimisticContext;
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(promptsKey, context.previousPrompts);
      }
    },
    onSuccess: (newPrompt, _variables, context) => {
      queryClient.setQueryData<PromptListItem[]>(promptsKey, (current) => {
        if (!current) {
          return [newPrompt];
        }

        return current.map((prompt) => (prompt.id === context.optimisticId ? { ...newPrompt } : prompt));
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: promptsKey });
    },
  });

  const form = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      title: '',
      body: '',
      tags: '',
    },
  });

  const cachedPrompts = queryClient.getQueryData<PromptListItem[]>(promptsKey) ?? [];
  const serverPrompts = (promptsQuery.data ?? []) as PromptListItem[];
  const prompts = cachedPrompts.length ? cachedPrompts : serverPrompts;

  const handleUpgradeDialogChange = (open: boolean) => {
    setUpgradeOpen(open);
    if (!open) {
      setLastEvaluation(null);
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    const currentUsage = (queryClient.getQueryData<PromptListItem[]>(promptsKey) ?? prompts).length;
    const planLimits = planLimitsQuery.data as PlanLimitMap | undefined;

    if (!planLimits) {
      setLastEvaluation(null);
      return;
    }

    const evaluation = evaluateIntegerPlanLimit({
      limits: planLimits,
      key: PROMPTS_PER_PERSONAL_WS_LIMIT_KEY,
      currentUsage,
    });

    setLastEvaluation(evaluation);

    if (!evaluation.allowed) {
      setUpgradeOpen(true);
      return;
    }

    await createPromptMutation.mutateAsync(values);
    form.reset();
  });

  const renderPrompts = () => {
    if (!userId) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Sign in to manage your workspace prompts.
        </div>
      );
    }

    if (simulateError) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          {buildErrorMessage('Simulated fetch failure')}
        </div>
      );
    }

    if (promptsQuery.status === 'pending' && prompts.length === 0) {
      return <div className="rounded-md border border-dashed p-6 text-sm">Loading prompts…</div>;
    }

    if (promptsQuery.status === 'error') {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          {buildErrorMessage(promptsQuery.error?.message)}
        </div>
      );
    }

    if (prompts.length === 0) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No prompts yet. Use the form to add your first template.
        </div>
      );
    }

    return (
      <ul className="space-y-3">
        {prompts.map((prompt) => (
          <li key={prompt.id} className="rounded-md border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {prompt.title}
                  {prompt.isOptimistic ? (
                    <span className="ml-2 text-xs uppercase text-muted-foreground">(saving…)</span>
                  ) : null}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{prompt.body}</p>
              </div>
              {prompt.tags.length ? (
                <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                  {prompt.tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-2 py-0.5">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const handleResetData = () => {
    queryClient.setQueryData<PromptListItem[]>(promptsKey, []);
  };

  const handleRestoreSeed = () => {
    setSimulateError(false);
    queryClient.invalidateQueries({ queryKey: promptsKey });
  };

  const isLoading = promptsQuery.status === 'pending' && prompts.length === 0;
  const isError = simulateError || promptsQuery.status === 'error';
  const isEmpty = serverPrompts.length === 0 && promptsQuery.status === 'success';
  const isPlanLimitLoading = planId ? planLimitsQuery.status === 'pending' : isPlanLookupLoading;
  const planLimitError = planLimitsQuery.status === 'error';
  const planLimitRecord = planLimitsQuery.data?.[PROMPTS_PER_PERSONAL_WS_LIMIT_KEY] ?? null;
  const planLimitValueLabel = React.useMemo(() => {
    if (isPlanLimitLoading) {
      return 'Checking plan limits…';
    }

    if (planLookupError) {
      return 'Plan lookup failed';
    }

    if (planLimitError) {
      return 'Plan limit unavailable';
    }

    if (!planLimitRecord) {
      return 'Plan limit missing';
    }

    return `Plan limit: ${planLimitRecord.value_int ?? 'Unlimited'} prompts`;
  }, [isPlanLimitLoading, planLookupError, planLimitError, planLimitRecord]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
        <p className="text-sm text-muted-foreground">
          Manage prompt templates backed by Supabase with optimistic updates, loading, empty, and error states.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="rounded border px-2 py-1 font-medium text-foreground hover:bg-muted"
          onClick={() => setSimulateError((prev) => !prev)}
        >
          {simulateError ? 'Disable error simulation' : 'Simulate error state'}
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 font-medium text-foreground hover:bg-muted"
          onClick={handleResetData}
        >
          Show empty state
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 font-medium text-foreground hover:bg-muted"
          onClick={handleRestoreSeed}
        >
          Refetch Supabase data
        </button>
        <span>Optimistic updates display a “saving…” badge while the mutation is in flight.</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px),1fr]">
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">New prompt</h2>
            <p className="text-sm text-muted-foreground">
              The form uses React Hook Form with a Zod schema validated against Supabase fields.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="title">
                Title
              </label>
              <Input id="title" placeholder="Summarize meeting notes" {...form.register('title')} />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="body">
                Prompt body
              </label>
              <textarea
                id="body"
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="You are an AI assistant..."
                {...form.register('body')}
              />
              {form.formState.errors.body ? (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="tags">
                Tags
              </label>
              <Input id="tags" placeholder="productivity, meeting" {...form.register('tags')} />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{planLimitValueLabel}</span>
              {lastEvaluation && lastEvaluation.shouldRecommendUpgrade ? (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setUpgradeOpen(true)}
                >
                  Why upgrade?
                </button>
              ) : null}
            </div>

            {planLookupError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
                <p className="flex-1">
                  Failed to load your plan. {planLookupErrorMessage ?? 'Please try again.'}
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => userPlanQuery.refetch()}
                  disabled={isPlanLookupLoading}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {planLimitError ? (
              <p className="text-xs text-destructive">Failed to load plan limits. Please try again.</p>
            ) : null}

            <Button
              type="submit"
              disabled={
                !userId ||
                isLoading ||
                createPromptMutation.isPending ||
                simulateError ||
                isPlanLimitLoading ||
                planLookupError ||
                planLimitError ||
                !planLimitRecord
              }
            >
              {createPromptMutation.isPending
                ? 'Saving…'
                : isLoading
                ? 'Loading…'
                : !userId
                ? 'Sign in to create prompts'
                : simulateError
                ? 'Unavailable during error simulation'
                : isPlanLimitLoading
                ? 'Checking plan limits…'
                : planLookupError
                ? 'Plan lookup failed'
                : planLimitError
                ? 'Plan limits unavailable'
                : !planLimitRecord
                ? 'Missing plan limit'
                : 'Create prompt'}
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Workspace prompts</h2>
            <span className="text-sm text-muted-foreground">
              Query key: [{promptsKey[0]}, "{promptsKey[1]}"]
            </span>
          </div>
          {renderPrompts()}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Loading',
            active: isLoading,
            description: 'Shows a dashed placeholder while data is loading.',
          },
          {
            label: 'Empty',
            active: isEmpty,
            description: 'Use the developer shortcut to inspect the empty illustration.',
          },
          {
            label: 'Error',
            active: isError,
            description: 'Toggle the error simulation or trigger a failed fetch to inspect fallback UI.',
          },
          {
            label: 'Optimistic update',
            active: createPromptMutation.isPending,
            description: 'The list immediately renders the new prompt with a saving badge.',
          },
        ].map((state) => (
          <div
            key={state.label}
            className={`rounded-lg border p-4 text-sm ${
              state.active ? 'border-primary bg-primary/5 text-foreground' : 'border-dashed text-muted-foreground'
            }`}
          >
            <p className="font-semibold">{state.label}</p>
            <p className="mt-1 text-xs leading-relaxed">{state.description}</p>
          </div>
        ))}
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={handleUpgradeDialogChange} evaluation={lastEvaluation} />
    </section>
  );
};
