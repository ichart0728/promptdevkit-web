import * as React from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';

import type { Prompt } from '../api/prompts';
import { togglePromptFavorite, type PromptFavorite } from '../api/promptFavorites';

export type PromptListItemData = Prompt & { isOptimistic?: boolean; isFavorite?: boolean };

export type PromptFavoritesMap = Record<string, boolean>;

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
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(favoritesQueryKey, context.previousFavorites);
      queryClient.setQueryData(promptsQueryKey, context.previousPrompts);
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
    },
    onSettled: () => {
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

  return (
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
  );
};
