import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PostgrestError } from '@supabase/postgrest-js';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { UpgradeDialog } from '@/components/common/UpgradeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  evaluateIntegerPlanLimit,
  type IntegerPlanLimitEvaluation,
  type PlanLimitMap,
} from '@/lib/limits';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useActiveWorkspace } from '@/domains/workspaces/hooks/useActiveWorkspace';
import { createPrompt, deletePrompt, fetchPrompts, promptsQueryKey, type Prompt } from '../api/prompts';
import { PromptEditorDialog } from '../components/PromptEditorDialog';
import {
  fetchPlanLimits,
  fetchUserPlanId,
  planLimitsQueryKey,
  userPlanQueryKey,
} from '../api/planLimits';
import { fetchPromptFavorite, promptFavoritesQueryKey } from '../api/promptFavorites';
import { PromptFavoriteButton } from '../components/PromptFavoriteButton';

const PROMPTS_PER_PERSONAL_WS_LIMIT_KEY = 'prompts_per_personal_ws';
const PROMPTS_PER_TEAM_WS_LIMIT_KEY = 'prompts_per_team_ws';

const PLAN_LIMIT_KEYS_BY_WORKSPACE_TYPE = {
  personal: PROMPTS_PER_PERSONAL_WS_LIMIT_KEY,
  team: PROMPTS_PER_TEAM_WS_LIMIT_KEY,
} as const;

const promptSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  tags: z.string().optional(),
});

export type PromptFormValues = z.infer<typeof promptSchema>;

const MAX_FILTER_INPUT_LENGTH = 200;

const promptFiltersFieldSchema = z.object({
  q: z
    .string()
    .max(MAX_FILTER_INPUT_LENGTH, `Search must be ${MAX_FILTER_INPUT_LENGTH} characters or fewer`)
    .optional(),
  tags: z
    .string()
    .max(MAX_FILTER_INPUT_LENGTH, `Tags filter must be ${MAX_FILTER_INPUT_LENGTH} characters or fewer`)
    .optional(),
});

const promptFiltersSubmitSchema = promptFiltersFieldSchema.transform(({ q, tags }) => ({
  q: q?.trim() ?? '',
  tags: formatTags(tags),
}));

type PromptFiltersFieldValues = z.infer<typeof promptFiltersFieldSchema>;
type PromptFiltersSubmitValues = z.infer<typeof promptFiltersSubmitSchema>;

type PromptListItemData = Prompt & { isOptimistic?: boolean; isFavorite?: boolean };

type PromptFavoritesMap = Record<string, boolean>;

const EMPTY_FAVORITES_MAP: PromptFavoritesMap = {};

type PromptsSearchParams = {
  q?: string;
  tags?: string[] | string;
  promptId?: string;
  threadId?: string;
};

type OptimisticContext = {
  previousPrompts: PromptListItemData[];
  optimisticId: string;
  queryKey: ReturnType<typeof promptsQueryKey>;
};

type DeleteOptimisticContext = {
  previousPrompts: PromptListItemData[];
  queryKey: ReturnType<typeof promptsQueryKey>;
};

type PromptListItemRowProps = {
  prompt: PromptListItemData;
  onEdit: (prompt: PromptListItemData) => void;
  onDelete: (prompt: PromptListItemData) => void;
  disableDelete: boolean;
  userId: string | null;
  workspaceId: string | null;
  promptsQueryKey: QueryKey;
  favoritesQueryKey: QueryKey;
};

const PromptListItemRow = ({
  prompt,
  onEdit,
  onDelete,
  disableDelete,
  userId,
  workspaceId,
  promptsQueryKey,
  favoritesQueryKey,
}: PromptListItemRowProps) => (
  <li key={prompt.id}>
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{prompt.title}</h3>
            {prompt.isOptimistic ? (
              <span className="text-xs uppercase text-muted-foreground">(saving…)</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PromptFavoriteButton
            prompt={prompt}
            userId={userId}
            workspaceId={workspaceId}
            promptsQueryKey={promptsQueryKey}
            favoritesQueryKey={favoritesQueryKey}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(prompt)}
              disabled={prompt.isOptimistic}
              aria-label={`Edit prompt ${prompt.title}`}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onDelete(prompt)}
              disabled={prompt.isOptimistic || disableDelete}
              aria-label={`Delete prompt ${prompt.title}`}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{prompt.body}</p>
      {prompt.note ? <p className="text-xs italic text-muted-foreground">Note: {prompt.note}</p> : null}
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
);

const formatTags = (raw: string | undefined) =>
  raw?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

const buildErrorMessage = (message?: string) =>
  `Failed to load prompts. ${message ?? 'Unknown error'}`;

const PLAN_LIMIT_ERROR_CODE = 'P0001';

const isPostgrestError = (error: unknown): error is PostgrestError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code: unknown }).code === 'string';

const isPlanLimitError = (error: unknown): error is PostgrestError =>
  isPostgrestError(error) && (error as PostgrestError).code === PLAN_LIMIT_ERROR_CODE;

const buildPlanLimitErrorMessage = (error: PostgrestError) => {
  const sanitize = (value: string | null | undefined) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const extra = [sanitize(error.details), sanitize(error.hint)];

  if (!extra.filter(Boolean).length) {
    const fallback = sanitize(error.message);
    return fallback
      ? `You have reached your prompt limit for this workspace. ${fallback}`
      : 'You have reached your prompt limit for this workspace.';
  }

  return `You have reached your prompt limit for this workspace. ${extra
    .filter(Boolean)
    .join(' ')}`;
};

type FetchFavoritesParams = {
  promptIds: string[];
  userId: string;
};

const fetchFavoritesForPromptIds = async ({ promptIds, userId }: FetchFavoritesParams): Promise<PromptFavoritesMap> => {
  if (promptIds.length === 0) {
    return {};
  }

  const favorites = await Promise.all(
    promptIds.map(async (promptId) => {
      const favorite = await fetchPromptFavorite({ promptId, userId });
      return [promptId, Boolean(favorite)] as const;
    }),
  );

  return favorites.reduce<PromptFavoritesMap>((accumulator, [promptId, isFavorite]) => {
    // eslint-disable-next-line no-param-reassign -- accumulator mutation is intentional for performance.
    accumulator[promptId] = isFavorite;
    return accumulator;
  }, {});
};

export const PromptsPage = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useSessionQuery();
  const activeWorkspace = useActiveWorkspace();
  const navigate = useNavigate({ from: '/prompts' });
  const searchParams = useSearch({ from: '/prompts' }) as PromptsSearchParams;
  const [simulateError, setSimulateError] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);
  const [createPromptError, setCreatePromptError] = React.useState<string | null>(null);
  const [promptPendingDeletion, setPromptPendingDeletion] = React.useState<PromptListItemData | null>(null);
  const [promptBeingEdited, setPromptBeingEdited] = React.useState<PromptListItemData | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorInitialTab, setEditorInitialTab] = React.useState<'edit' | 'history' | 'discussion'>('edit');
  const [editorInitialThreadId, setEditorInitialThreadId] = React.useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);

  const workspaceId = activeWorkspace?.id ?? null;
  const workspaceType = activeWorkspace?.type ?? null;
  const workspaceName = activeWorkspace?.name ?? null;
  const planLimitKey = workspaceType ? PLAN_LIMIT_KEYS_BY_WORKSPACE_TYPE[workspaceType] : null;
  const promptsKey = React.useMemo(
    () => (workspaceId ? promptsQueryKey(workspaceId) : (['prompts', 'no-workspace'] as const)),
    [workspaceId],
  );
  const userId = sessionQuery.data?.user?.id ?? null;
  const favoritesQueryKeyValue = React.useMemo(
    () => promptFavoritesQueryKey(workspaceId && userId ? `${workspaceId}:${userId}` : null),
    [workspaceId, userId],
  );
  const mentionNavigationHandledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setShowFavoritesOnly(false);
  }, [workspaceId]);

  const promptsQuery = useQuery({
    queryKey: promptsKey,
    queryFn: () =>
      workspaceId && activeWorkspace
        ? fetchPrompts({ workspace: activeWorkspace })
        : Promise.reject(new Error('Workspace is required to fetch prompts.')),
    enabled: !!userId && !!workspaceId,
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

  const createPromptMutation = useMutation<Prompt, Error | PostgrestError, PromptFormValues, OptimisticContext>({
    mutationFn: async (values) => {
      if (!userId) {
        throw new Error('You must be signed in to create prompts.');
      }

      if (!workspaceId || !activeWorkspace) {
        throw new Error('You must select a workspace before creating prompts.');
      }

      return createPrompt({
        workspace: activeWorkspace,
        userId,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
      });
    },
    onMutate: async (values) => {
      if (!workspaceId) {
        throw new Error('You must select a workspace before creating prompts.');
      }

      const mutationQueryKey = promptsQueryKey(workspaceId);

      setCreatePromptError(null);

      await queryClient.cancelQueries({ queryKey: mutationQueryKey });
      const previousPrompts = queryClient.getQueryData<PromptListItemData[]>(mutationQueryKey) ?? [];
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticPrompt: PromptListItemData = {
        id: optimisticId,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
        note: null,
        isOptimistic: true,
      };

      queryClient.setQueryData<PromptListItemData[]>(mutationQueryKey, [...previousPrompts, optimisticPrompt]);

      return { previousPrompts, optimisticId, queryKey: mutationQueryKey } satisfies OptimisticContext;
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousPrompts);
      }

      if (isPlanLimitError(error)) {
        const planLimits = planLimitsQuery.data as PlanLimitMap | undefined;
        const usage = context ? context.previousPrompts.length : prompts.length;

        if (planLimits && planLimitKey) {
          const evaluation = evaluateIntegerPlanLimit({
            limits: planLimits,
            key: planLimitKey,
            currentUsage: usage,
          });

          setLastEvaluation(evaluation);
        } else {
          setLastEvaluation(null);
        }

        setUpgradeOpen(true);
        setCreatePromptError(buildPlanLimitErrorMessage(error));
        return;
      }

      setCreatePromptError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to create prompt. Please try again.',
      );
      console.error(error);
    },
    onSuccess: (newPrompt, _variables, context) => {
      if (!context) {
        queryClient.invalidateQueries({ queryKey: promptsKey });
        setCreatePromptError(null);
        return;
      }

      queryClient.setQueryData<PromptListItemData[]>(context.queryKey, (current) => {
        if (!current) {
          return [newPrompt];
        }

        return current.map((prompt) => (prompt.id === context.optimisticId ? { ...newPrompt } : prompt));
      });

      setCreatePromptError(null);
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
        return;
      }

      queryClient.invalidateQueries({ queryKey: promptsKey });
    },
  });

  const deletePromptMutation = useMutation<string, Error, PromptListItemData, DeleteOptimisticContext>({
    mutationFn: async (prompt) => {
      if (prompt.isOptimistic) {
        throw new Error('Cannot delete a prompt while it is still saving.');
      }

      if (!userId) {
        throw new Error('You must be signed in to delete prompts.');
      }

      if (!workspaceId || !activeWorkspace) {
        throw new Error('You must select a workspace before deleting prompts.');
      }

      return deletePrompt({
        workspace: activeWorkspace,
        userId,
        promptId: prompt.id,
      });
    },
    onMutate: async (prompt) => {
      if (!workspaceId) {
        throw new Error('You must select a workspace before deleting prompts.');
      }

      const mutationQueryKey = promptsQueryKey(workspaceId);

      await queryClient.cancelQueries({ queryKey: mutationQueryKey });
      const previousPrompts = queryClient.getQueryData<PromptListItemData[]>(mutationQueryKey) ?? [];

      queryClient.setQueryData<PromptListItemData[]>(
        mutationQueryKey,
        previousPrompts.filter((item) => item.id !== prompt.id),
      );

      return { previousPrompts, queryKey: mutationQueryKey } satisfies DeleteOptimisticContext;
    },
    onError: (_error, _prompt, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousPrompts);
      }
    },
    onSuccess: () => {
      setLastEvaluation(null);
      setUpgradeOpen(false);
      setPromptPendingDeletion(null);
    },
    onSettled: (_data, _error, _prompt, context) => {
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
        return;
      }

      queryClient.invalidateQueries({ queryKey: promptsKey });
    },
  });

  const handlePromptEditClick = (prompt: PromptListItemData) => {
    if (prompt.isOptimistic) {
      return;
    }

    if (!activeWorkspace || !workspaceId || !userId) {
      return;
    }

    setUpgradeOpen(false);
    setLastEvaluation(null);
    setEditorInitialTab('edit');
    setEditorInitialThreadId(null);
    setPromptBeingEdited(prompt);
    setEditorOpen(true);
  };

  const handleEditorOpenChange = (open: boolean) => {
    if (!open) {
      setPromptBeingEdited(null);
      setEditorInitialTab('edit');
      setEditorInitialThreadId(null);
    }

    setEditorOpen(open);
  };

  const handlePromptDeleteClick = (prompt: PromptListItemData) => {
    if (prompt.isOptimistic) {
      return;
    }

    deletePromptMutation.reset();
    setPromptPendingDeletion(prompt);
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    if (open) {
      return;
    }

    if (deletePromptMutation.isPending) {
      return;
    }

    setPromptPendingDeletion(null);
    deletePromptMutation.reset();
  };

  const handleConfirmDelete = async () => {
    if (!promptPendingDeletion) {
      return;
    }

    deletePromptMutation.reset();
    try {
      await deletePromptMutation.mutateAsync(promptPendingDeletion);
    } catch (error) {
      console.error(error);
    }
  };

  const form = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      title: '',
      body: '',
      tags: '',
    },
  });

  const cachedPrompts = queryClient.getQueryData<PromptListItemData[]>(promptsKey) ?? [];
  const serverPrompts = (promptsQuery.data ?? []) as PromptListItemData[];
  const prompts = cachedPrompts.length ? cachedPrompts : serverPrompts;
  const promptIds = React.useMemo(() => prompts.map((prompt) => prompt.id), [prompts]);
  const promptIdsSignature = React.useMemo(() => promptIds.join(','), [promptIds]);

  const rawSearchQuery = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const rawSearchTags = searchParams?.tags;
  const mentionPromptId =
    typeof searchParams?.promptId === 'string' && searchParams.promptId.trim().length > 0
      ? searchParams.promptId
      : null;
  const mentionThreadId =
    typeof searchParams?.threadId === 'string' && searchParams.threadId.trim().length > 0
      ? searchParams.threadId
      : null;
  const searchTags = React.useMemo(() => {
    if (Array.isArray(rawSearchTags)) {
      return rawSearchTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    }

    if (typeof rawSearchTags === 'string') {
      return formatTags(rawSearchTags);
    }

    return [];
  }, [rawSearchTags]);
  const searchTagsInputValue = React.useMemo(() => searchTags.join(', '), [searchTags]);

  const filtersForm = useForm<PromptFiltersFieldValues>({
    resolver: zodResolver(promptFiltersFieldSchema),
    defaultValues: {
      q: rawSearchQuery,
      tags: searchTagsInputValue,
    },
  });

  React.useEffect(() => {
    filtersForm.reset({ q: rawSearchQuery, tags: searchTagsInputValue });
  }, [filtersForm, rawSearchQuery, searchTagsInputValue]);

  React.useEffect(() => {
    if (!workspaceId || !userId) {
      return;
    }

    if (promptIds.length === 0) {
      queryClient.setQueryData<PromptFavoritesMap>(favoritesQueryKeyValue, {});
      return;
    }

    queryClient.invalidateQueries({ queryKey: favoritesQueryKeyValue });
  }, [
    promptIds.length,
    promptIdsSignature,
    workspaceId,
    userId,
    favoritesQueryKeyValue,
    queryClient,
  ]);

  const favoritesQuery = useQuery<PromptFavoritesMap>({
    queryKey: favoritesQueryKeyValue,
    queryFn: () => fetchFavoritesForPromptIds({ promptIds, userId: userId as string }),
    enabled: !!workspaceId && !!userId && promptIds.length > 0,
    placeholderData: () => queryClient.getQueryData<PromptFavoritesMap>(favoritesQueryKeyValue) ?? {},
  });

  const favoritesMap = favoritesQuery.data ?? EMPTY_FAVORITES_MAP;
  const promptsWithFavorites = React.useMemo(() => {
    if (Object.keys(favoritesMap).length === 0) {
      return prompts;
    }

    return prompts.map((prompt) => {
      const isFavorite = favoritesMap[prompt.id] ?? prompt.isFavorite ?? false;

      if (prompt.isFavorite === isFavorite) {
        return prompt;
      }

      return { ...prompt, isFavorite } satisfies PromptListItemData;
    });
  }, [favoritesMap, prompts]);
  const shouldFilterFavorites = showFavoritesOnly && favoritesQuery.status !== 'error';
  const favoritesFilterLabel = showFavoritesOnly ? 'Show all prompts' : 'Show favorites only';
  const normalizedSearchQuery = React.useMemo(() => rawSearchQuery.trim().toLowerCase(), [rawSearchQuery]);
  const normalizedTagFilters = React.useMemo(() => searchTags.map((tag) => tag.toLowerCase()), [searchTags]);
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const hasTagFilters = normalizedTagFilters.length > 0;
  const filteredPrompts = React.useMemo(() => {
    let result = promptsWithFavorites;

    if (hasSearchQuery) {
      result = result.filter((prompt) => {
        const titleMatches = prompt.title.toLowerCase().includes(normalizedSearchQuery);
        const tagMatches = prompt.tags.some((tag) => tag.toLowerCase().includes(normalizedSearchQuery));
        return titleMatches || tagMatches;
      });
    }

    if (hasTagFilters) {
      result = result.filter((prompt) => {
        if (prompt.tags.length === 0) {
          return false;
        }

        const promptTags = prompt.tags.map((tag) => tag.toLowerCase());
        return normalizedTagFilters.every((tag) => promptTags.includes(tag));
      });
    }

    if (shouldFilterFavorites) {
      result = result.filter((prompt) => prompt.isFavorite);
    }

    return result;
  }, [
    hasSearchQuery,
    hasTagFilters,
    normalizedSearchQuery,
    normalizedTagFilters,
    promptsWithFavorites,
    shouldFilterFavorites,
  ]);
  const hasActiveFilters = hasSearchQuery || hasTagFilters;
  const currentUsage = prompts.length;

  React.useEffect(() => {
    if (!mentionPromptId) {
      mentionNavigationHandledRef.current = null;
      return;
    }

    const signature = `${mentionPromptId}:${mentionThreadId ?? ''}`;

    if (mentionNavigationHandledRef.current === signature) {
      return;
    }

    if (!activeWorkspace || !workspaceId || !userId) {
      return;
    }

    if (!prompts.length) {
      return;
    }

    const targetPrompt = prompts.find((prompt) => prompt.id === mentionPromptId);

    if (!targetPrompt) {
      return;
    }

    setUpgradeOpen(false);
    setLastEvaluation(null);
    setEditorInitialTab('discussion');
    setEditorInitialThreadId(mentionThreadId ?? null);
    setPromptBeingEdited(targetPrompt);
    setEditorOpen(true);
    mentionNavigationHandledRef.current = signature;

    void navigate({
      to: '.',
      search: (previous) => ({
        ...previous,
        promptId: undefined,
        threadId: undefined,
      }),
      replace: true,
    });
  }, [
    activeWorkspace,
    mentionPromptId,
    mentionThreadId,
    navigate,
    prompts,
    userId,
    workspaceId,
  ]);

  const handleUpgradeDialogChange = (open: boolean) => {
    setUpgradeOpen(open);
    if (!open) {
      setLastEvaluation(null);
    }
  };

  const handleFiltersSubmit = filtersForm.handleSubmit((values) => {
    const parsedFilters: PromptFiltersSubmitValues = promptFiltersSubmitSchema.parse(values);
    void navigate({
      to: '.',
      search: (previous) => ({
        ...previous,
        q: parsedFilters.q.length > 0 ? parsedFilters.q : undefined,
        tags: parsedFilters.tags.length > 0 ? parsedFilters.tags : undefined,
        promptId: undefined,
        threadId: undefined,
      }),
      replace: true,
    });
  });

  const handleFiltersReset = () => {
    filtersForm.reset({ q: '', tags: '' });
    void navigate({
      to: '.',
      search: (previous) => ({
        ...previous,
        q: undefined,
        tags: undefined,
        promptId: undefined,
        threadId: undefined,
      }),
      replace: true,
    });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    setCreatePromptError(null);
    const currentUsage = (queryClient.getQueryData<PromptListItemData[]>(promptsKey) ?? prompts).length;
    const planLimits = planLimitsQuery.data as PlanLimitMap | undefined;

    if (!planLimits) {
      setLastEvaluation(null);
      return;
    }

    if (!planLimitKey) {
      setLastEvaluation(null);
      return;
    }

    const evaluation = evaluateIntegerPlanLimit({
      limits: planLimits,
      key: planLimitKey,
      currentUsage,
    });

    setLastEvaluation(evaluation);

    if (!evaluation.allowed) {
      setUpgradeOpen(true);
      return;
    }

    if (!workspaceId) {
      setLastEvaluation(null);
      return;
    }

    try {
      await createPromptMutation.mutateAsync(values);
      form.reset();
    } catch (error) {
      if (!isPlanLimitError(error)) {
        console.error(error);
      }
    }
  });

  const renderPrompts = () => {
    if (!userId) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Sign in to manage your workspace prompts.
        </div>
      );
    }

    if (!workspaceId) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No workspaces available. Create or join a workspace to manage prompts.
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

    if (showFavoritesOnly && favoritesQuery.status === 'pending') {
      return <div className="rounded-md border border-dashed p-6 text-sm">Loading favorite prompts…</div>;
    }

    if (shouldFilterFavorites && filteredPrompts.length === 0 && !hasActiveFilters) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No favorite prompts yet. Toggle favorites to curate this list or disable the filter to see all prompts.
        </div>
      );
    }

    if (filteredPrompts.length === 0 && (hasActiveFilters || shouldFilterFavorites)) {
      return (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          {shouldFilterFavorites
            ? 'No favorite prompts match your filters. Adjust your search terms, clear tag filters, or disable the favorites filter.'
            : 'No prompts match your filters. Adjust your search terms or clear the tag filters to see more results.'}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {favoritesQuery.status === 'error' ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Failed to load favorites. Showing all prompts.
          </div>
        ) : null}
        <ul className="space-y-3">
          {filteredPrompts.map((prompt) => (
            <PromptListItemRow
              key={prompt.id}
              prompt={prompt}
              onEdit={handlePromptEditClick}
              onDelete={handlePromptDeleteClick}
              disableDelete={deletePromptMutation.isPending}
              userId={userId}
              workspaceId={workspaceId}
              promptsQueryKey={promptsKey}
              favoritesQueryKey={favoritesQueryKeyValue}
            />
          ))}
        </ul>
      </div>
    );
  };

  const handleResetData = () => {
    queryClient.setQueryData<PromptListItemData[]>(promptsKey, []);
    setLastEvaluation(null);
    setUpgradeOpen(false);
    setCreatePromptError(null);
    setShowFavoritesOnly(false);
    if (workspaceId && userId) {
      queryClient.setQueryData<PromptFavoritesMap>(favoritesQueryKeyValue, {});
    }
  };

  const handleRestoreSeed = () => {
    setSimulateError(false);
    setLastEvaluation(null);
    setUpgradeOpen(false);
    setCreatePromptError(null);
    queryClient.invalidateQueries({ queryKey: promptsKey });
    if (workspaceId && userId) {
      setShowFavoritesOnly(false);
      queryClient.invalidateQueries({ queryKey: favoritesQueryKeyValue });
    }
  };

  const isLoading = promptsQuery.status === 'pending' && prompts.length === 0 && !!workspaceId;
  const isError = simulateError || promptsQuery.status === 'error';
  const isEmpty = serverPrompts.length === 0 && promptsQuery.status === 'success';
  const isPlanLimitLoading = planId ? planLimitsQuery.status === 'pending' : isPlanLookupLoading;
  const planLimitError = planLimitsQuery.status === 'error';
  const planLimitRecord = planLimitKey ? planLimitsQuery.data?.[planLimitKey] ?? null : null;
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

    if (!planLimitKey) {
      return 'Select a workspace to check plan limits';
    }

    if (!planLimitRecord) {
      return 'Plan limit missing';
    }

    const workspaceLabel = workspaceName ?? 'workspace';
    const limitValue = planLimitRecord.value_int;

    if (limitValue === null) {
      return `Current usage in ${workspaceLabel}: ${currentUsage} prompts (unlimited plan)`;
    }

    return `Current usage in ${workspaceLabel}: ${currentUsage} of ${limitValue} prompts`;
  }, [
    currentUsage,
    isPlanLimitLoading,
    planLookupError,
    planLimitError,
    planLimitRecord,
    workspaceName,
    planLimitKey,
  ]);

  const lastWorkspaceIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const previousWorkspaceId = lastWorkspaceIdRef.current;

    if (workspaceId && workspaceId !== previousWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: promptsQueryKey(workspaceId) });
    }

    if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
      queryClient.invalidateQueries({ queryKey: promptsQueryKey(previousWorkspaceId) });
    }

    if (previousWorkspaceId !== workspaceId) {
      setLastEvaluation(null);
      setUpgradeOpen(false);
      setPromptBeingEdited(null);
      setEditorOpen(false);
      setEditorInitialTab('edit');
      setEditorInitialThreadId(null);
    }

    lastWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, queryClient]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {workspaceName ? `Workspace: ${workspaceName}` : 'No workspace selected'}
          </span>
        </div>
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

            {createPromptError ? (
              <p className="text-xs text-destructive">{createPromptError}</p>
            ) : null}

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
                !workspaceId ||
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
                : !workspaceId
                ? 'Select a workspace to create prompts'
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">
              Workspace prompts{workspaceName ? ` · ${workspaceName}` : ''}
            </h2>
            {workspaceType ? (
              <span className="text-xs uppercase text-muted-foreground">
                {workspaceType === 'team' ? 'Team workspace' : 'Personal workspace'}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-sm text-muted-foreground">
              Query key: [{promptsKey[0]}, "{promptsKey[1]}"]
            </span>
            <Button
              type="button"
              variant={showFavoritesOnly ? 'default' : 'outline'}
              size="sm"
              aria-pressed={showFavoritesOnly}
              onClick={() => setShowFavoritesOnly((previous) => !previous)}
              disabled={prompts.length === 0}
            >
              {favoritesFilterLabel}
            </Button>
          </div>
        </div>
        <form onSubmit={handleFiltersSubmit} className="flex flex-col gap-3 rounded-md border bg-card/40 p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="prompts-search">
              Search
            </label>
            <Input
              id="prompts-search"
              type="search"
              placeholder="Search by title or tag"
              {...filtersForm.register('q')}
            />
            {filtersForm.formState.errors.q ? (
              <p className="text-xs text-destructive">{filtersForm.formState.errors.q.message}</p>
            ) : null}
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="prompts-tags">
              Tags (comma separated)
            </label>
            <Input id="prompts-tags" placeholder="meeting, summary" {...filtersForm.register('tags')} />
            {filtersForm.formState.errors.tags ? (
              <p className="text-xs text-destructive">{filtersForm.formState.errors.tags.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFiltersReset}
              disabled={!hasSearchQuery && !hasTagFilters}
            >
              Clear filters
            </Button>
          </div>
        </form>
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

      <PromptEditorDialog
        open={editorOpen && !!promptBeingEdited}
        onOpenChange={handleEditorOpenChange}
        prompt={promptBeingEdited}
        workspace={activeWorkspace ?? null}
        userId={userId}
        initialTab={editorInitialTab}
        initialThreadId={editorInitialThreadId}
      />

      <Dialog open={!!promptPendingDeletion} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete prompt</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete “{promptPendingDeletion?.title}”? This will remove the
              prompt from the current workspace.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deletion updates the prompt record with a soft delete timestamp. You can restore it later
            by clearing the <code>deleted_at</code> field in Supabase.
          </p>
          {deletePromptMutation.isError ? (
            <p className="text-sm text-destructive">
              {deletePromptMutation.error?.message ?? 'Failed to delete the prompt. Please try again.'}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleDeleteDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletePromptMutation.isPending}
            >
              {deletePromptMutation.isPending ? 'Deleting…' : 'Delete prompt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={handleUpgradeDialogChange}
        evaluation={lastEvaluation}
        onResetEvaluation={() => setLastEvaluation(null)}
      />
    </section>
  );
};
