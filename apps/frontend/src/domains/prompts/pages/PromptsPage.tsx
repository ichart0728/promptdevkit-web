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
  indexPlanLimits,
  type IntegerPlanLimitEvaluation,
  type PlanLimitRecord,
} from '@/lib/limits';

const PROMPTS_QUERY_PARAMS = { workspaceId: 'demo-workspace' } as const;
const PROMPTS_QUERY_KEY = ['prompts', PROMPTS_QUERY_PARAMS] as const;

const planLimitSeed: PlanLimitRecord[] = [
  {
    key: 'prompts_per_personal_ws',
    value_int: 5,
    value_str: null,
    value_json: null,
  },
];

const planLimitMap = indexPlanLimits(planLimitSeed);

const promptSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  tags: z.string().optional(),
});

export type PromptFormValues = z.infer<typeof promptSchema>;

type Prompt = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  isOptimistic?: boolean;
};

type OptimisticContext = {
  previousPrompts?: Prompt[];
  optimisticId?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const seedPrompts: Prompt[] = [
  {
    id: 'seed-1',
    title: 'Meeting summary assistant',
    body: 'Summarize notes into action items and highlights.',
    tags: ['summary', 'meeting'],
  },
];

const usePromptsQuery = (dbRef: React.MutableRefObject<Prompt[]>, simulateError: boolean) =>
  useQuery({
    queryKey: PROMPTS_QUERY_KEY,
    queryFn: async () => {
      await delay(300);
      if (simulateError) {
        throw new Error('Simulated fetch failure');
      }

      return dbRef.current;
    },
  });

const formatTags = (raw: string | undefined) =>
  raw?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

export const PromptsPage = () => {
  const queryClient = useQueryClient();
  const mockDbRef = React.useRef<Prompt[]>([...seedPrompts]);

  const [simulateError, setSimulateError] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);

  const promptsQuery = usePromptsQuery(mockDbRef, simulateError);

  React.useEffect(() => {
    queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY });
  }, [simulateError, queryClient]);

  const createPromptMutation = useMutation<Prompt, Error, PromptFormValues, OptimisticContext>({
    mutationFn: async (values) => {
      await delay(400);
      const newPrompt: Prompt = {
        id: crypto.randomUUID(),
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
      };
      mockDbRef.current = [...mockDbRef.current, newPrompt];
      return newPrompt;
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: PROMPTS_QUERY_KEY });
      const previousPrompts = queryClient.getQueryData<Prompt[]>(PROMPTS_QUERY_KEY) ?? mockDbRef.current;
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticPrompt: Prompt = {
        id: optimisticId,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
        isOptimistic: true,
      };

      queryClient.setQueryData<Prompt[]>(PROMPTS_QUERY_KEY, [...previousPrompts, optimisticPrompt]);

      return { previousPrompts, optimisticId } satisfies OptimisticContext;
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPrompts) {
        queryClient.setQueryData(PROMPTS_QUERY_KEY, context.previousPrompts);
      }
    },
    onSuccess: (newPrompt, _variables, context) => {
      queryClient.setQueryData<Prompt[]>(PROMPTS_QUERY_KEY, (current) => {
        if (!current) {
          return [newPrompt];
        }

        return current.map((prompt) => (prompt.id === context?.optimisticId ? { ...newPrompt } : prompt));
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY });
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

  const handleUpgradeDialogChange = (open: boolean) => {
    setUpgradeOpen(open);
    if (!open) {
      setLastEvaluation(null);
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    const currentUsage = promptsQuery.data?.length ?? mockDbRef.current.length;
    const evaluation = evaluateIntegerPlanLimit({
      limits: planLimitMap,
      key: 'prompts_per_personal_ws',
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
    if (promptsQuery.status === 'pending') {
      return <div className="rounded-md border border-dashed p-6 text-sm">Loading prompts…</div>;
    }

    if (promptsQuery.status === 'error') {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          Failed to load prompts. {promptsQuery.error?.message ?? 'Unknown error'}
        </div>
      );
    }

    const prompts = promptsQuery.data ?? [];

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
                  {prompt.isOptimistic ? <span className="ml-2 text-xs uppercase text-muted-foreground">(saving…)</span> : null}
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
    mockDbRef.current = [];
    queryClient.setQueryData(PROMPTS_QUERY_KEY, []);
  };

  const handleRestoreSeed = () => {
    mockDbRef.current = [...seedPrompts];
    queryClient.setQueryData(PROMPTS_QUERY_KEY, [...seedPrompts]);
  };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
        <p className="text-sm text-muted-foreground">
          Manage prompt templates. This page mocks optimistic updates, loading, empty, and error states while enforcing plan limits.
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
          Restore sample data
        </button>
        <span>Optimistic updates display a “saving…” badge while the mutation is in flight.</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px),1fr]">
        <div className="space-y-4 rounded-lg border p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">New prompt</h2>
            <p className="text-sm text-muted-foreground">
              The form uses React Hook Form with a Zod schema as a placeholder.
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
              <span>Plan limit: {planLimitSeed[0].value_int ?? 'Unlimited'} prompts</span>
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

            <Button type="submit" disabled={promptsQuery.status === 'pending' || createPromptMutation.isPending}>
              {createPromptMutation.isPending ? 'Saving…' : promptsQuery.status === 'pending' ? 'Loading…' : 'Create prompt'}
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Workspace prompts</h2>
            <span className="text-sm text-muted-foreground">
              Query key: [{PROMPTS_QUERY_KEY[0]}, {JSON.stringify(PROMPTS_QUERY_KEY[1])}]
            </span>
          </div>
          {renderPrompts()}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Loading',
            active: promptsQuery.status === 'pending',
            description: 'Shows a dashed placeholder while data is loading.',
          },
          {
            label: 'Empty',
            active: (promptsQuery.data ?? []).length === 0 && promptsQuery.status === 'success',
            description: 'Reset the dataset to view the empty illustration.',
          },
          {
            label: 'Error',
            active: promptsQuery.status === 'error',
            description: 'Toggle the error simulation to inspect fallback UI.',
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
