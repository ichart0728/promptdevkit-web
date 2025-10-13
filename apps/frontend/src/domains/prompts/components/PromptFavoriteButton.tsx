import * as React from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import { UpgradeDialog } from '@/components/common/UpgradeDialog';

import type { Prompt } from '../api/prompts';
import { togglePromptFavorite, type PromptFavorite } from '../api/promptFavorites';
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

export type PromptListItemData = Prompt & { isOptimistic?: boolean; isFavorite?: boolean };

export type PromptFavoritesMap = Record<string, boolean>;

const FAVORITES_PER_USER_LIMIT_KEY = 'favorites_per_user';

const buildStarPath =
  'M12 17.27 18.18 21 16.54 13.97 22 9.24 14.82 8.63 12 2 9.18 8.63 2 9.24 7.46 13.97 5.82 21z';

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    className={filled ? 'h-4 w-4 text-yellow-500' : 'h-4 w-4 text-muted-foreground'}
    viewBox="0 0 24 24"
    role="presentation"
  >
    <path d={buildStarPath} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

type PromptFavoriteButtonProps = {
  prompt: PromptListItemData;
  userId: string | null;
  workspaceId: string | null;
  promptsQueryKey: QueryKey;
  favoritesQueryKey: QueryKey;
};

type FavoriteOptimisticContext = {
  previousFavorites: PromptFavoritesMap;
  previousPrompts: PromptListItemData[];
};

export const PromptFavoriteButton = ({
  prompt,
  userId,
  workspaceId,
  promptsQueryKey,
  favoritesQueryKey,
}: PromptFavoriteButtonProps) => {
  const queryClient = useQueryClient();
  const isDisabled = !userId || !workspaceId || prompt.isOptimistic;
  const [isFocused, setIsFocused] = React.useState(false);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = React.useState(false);
  const [lastEvaluation, setLastEvaluation] = React.useState<IntegerPlanLimitEvaluation | null>(null);

  const userPlanQuery = useQuery({
    queryKey: userPlanQueryKey(userId ?? null),
    queryFn: () => {
      if (!userId) {
        throw new Error('Cannot evaluate plan limits without a user.');
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

  const cachedEvaluation = React.useMemo(() => {
    if (!planLimits) {
      return null;
    }

    const favoritesMap =
      queryClient.getQueryData<PromptFavoritesMap>(favoritesQueryKey) ?? ({} as PromptFavoritesMap);
    const currentUsage = Object.values(favoritesMap).filter(Boolean).length;
    const delta = prompt.isFavorite ? 0 : 1;

    return evaluateIntegerPlanLimit({
      limits: planLimits,
      key: FAVORITES_PER_USER_LIMIT_KEY,
      currentUsage,
      delta,
    });
  }, [favoritesQueryKey, planLimits, prompt.isFavorite, queryClient]);

  const mutation = useMutation<PromptFavorite | null, Error, boolean, FavoriteOptimisticContext | undefined>({
    mutationFn: (shouldFavorite) => {
      if (!userId) {
        throw new Error('You must be signed in to manage favorites.');
      }

      if (!workspaceId) {
        throw new Error('Select a workspace before managing favorites.');
      }

      return togglePromptFavorite({ promptId: prompt.id, userId, shouldFavorite });
    },
    onMutate: async (shouldFavorite) => {
      if (!userId || !workspaceId) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      await queryClient.cancelQueries({ queryKey: promptsQueryKey });

      const previousFavorites =
        queryClient.getQueryData<PromptFavoritesMap>(favoritesQueryKey) ?? ({} as PromptFavoritesMap);
      const previousPrompts = queryClient.getQueryData<PromptListItemData[]>(promptsQueryKey) ?? [];

      const optimisticFavorites = { ...previousFavorites, [prompt.id]: shouldFavorite } satisfies PromptFavoritesMap;
      const optimisticPrompts = previousPrompts.map((item) =>
        item.id === prompt.id ? { ...item, isFavorite: shouldFavorite } : item,
      );

      queryClient.setQueryData<PromptFavoritesMap>(favoritesQueryKey, optimisticFavorites);
      queryClient.setQueryData<PromptListItemData[]>(promptsQueryKey, optimisticPrompts);

      return { previousFavorites, previousPrompts } satisfies FavoriteOptimisticContext;
    },
    onSuccess: (result) => {
      const isFavorited = !!result;

      queryClient.setQueryData<PromptFavoritesMap>(favoritesQueryKey, (current) => ({
        ...(current ?? {}),
        [prompt.id]: isFavorited,
      }));

      queryClient.setQueryData<PromptListItemData[]>(promptsQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return current.map((item) => (item.id === prompt.id ? { ...item, isFavorite: isFavorited } : item));
      });

      setLastEvaluation(null);
      setIsUpgradeDialogOpen(false);
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(favoritesQueryKey, context.previousFavorites);
        queryClient.setQueryData(promptsQueryKey, context.previousPrompts);
      }

      if (error instanceof PlanLimitError) {
        const evaluation = error.evaluation ?? cachedEvaluation;
        const message = buildPlanLimitMessage(evaluation);

        setLastEvaluation(evaluation ?? cachedEvaluation ?? null);
        setIsUpgradeDialogOpen(true);
        toast({ title: 'Plan limit reached', description: message });
        return;
      }

      const fallbackMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to update favorite. Please try again.';

      toast({ title: 'Failed to update favorite', description: fallbackMessage });
      console.error(error);
    },
    onSettled: (_data, error) => {
      if (!(error instanceof PlanLimitError)) {
        setLastEvaluation(null);
        setIsUpgradeDialogOpen(false);
      }

      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
      queryClient.invalidateQueries({ queryKey: promptsQueryKey });
    },
  });

  const handleClick = () => {
    if (mutation.isPending || isDisabled) {
      return;
    }

    mutation.mutate(!(prompt.isFavorite ?? false));
  };

  const ariaLabel = `Toggle favorite for prompt ${prompt.title}`;
  const isPressed = prompt.isFavorite ?? false;

  const handleUpgradeDialogChange = (open: boolean) => {
    if (!open) {
      setLastEvaluation(null);
    }

    setIsUpgradeDialogOpen(open);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel}
        aria-pressed={isPressed}
        disabled={isDisabled || mutation.isPending}
        onClick={handleClick}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={isPressed ? 'text-yellow-500' : undefined}
      >
        <StarIcon filled={isPressed || isFocused} />
      </Button>

      <UpgradeDialog
        open={isUpgradeDialogOpen}
        onOpenChange={handleUpgradeDialogChange}
        evaluation={lastEvaluation ?? cachedEvaluation ?? null}
        onResetEvaluation={() => setLastEvaluation(null)}
      />
    </>
  );
};

const buildPlanLimitMessage = (evaluation: IntegerPlanLimitEvaluation | null | undefined) => {
  if (!evaluation) {
    return 'You have reached the favorites limit for your current plan.';
  }

  const derived = evaluateIntegerPlanLimit({
    limits: [
      {
        key: evaluation.key,
        value_int: typeof evaluation.limitValue === 'number' ? evaluation.limitValue : null,
        value_str: null,
        value_json: null,
      },
    ],
    key: evaluation.key,
    currentUsage: evaluation.currentUsage,
    delta: evaluation.delta,
  });

  if (derived.status === 'limit-exceeded') {
    if (typeof derived.limitValue === 'number') {
      return `You have reached the favorites limit of ${derived.limitValue.toLocaleString()} on your current plan.`;
    }

    return 'Your current plan does not allow adding more favorites.';
  }

  if (derived.status === 'limit-reached') {
    if (typeof derived.limitValue === 'number') {
      return `Adding this favorite would reach the limit of ${derived.limitValue.toLocaleString()} on your plan.`;
    }

    return 'Adding this favorite would reach the limit allowed by your current plan.';
  }

  return 'You have reached the favorites limit for your current plan.';
};
