import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/common/toast';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

import {
  togglePromptFavorite,
  userPromptFavoritesQueryKey,
  userPromptFavoritesQueryOptions,
  type UserPromptFavorite,
} from '../api/promptFavorites';

const MAX_FILTER_INPUT_LENGTH = 200;

const formatTags = (raw: string | undefined) =>
  raw?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

const normalizeSearchTags = (tags: string[]) => {
  const seen = new Set<string>();

  return tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag) {
        return false;
      }

      if (seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    });
};

const parseTagsParam = (raw: string | string[] | undefined) => {
  if (typeof raw === 'undefined') {
    return [];
  }

  if (Array.isArray(raw)) {
    return normalizeSearchTags(
      raw.flatMap((value) => formatTags(value)),
    );
  }

  return normalizeSearchTags(formatTags(raw));
};

const buildSearchParam = (value: string) => value.trim();

const joinTags = (tags: string[]) => tags.join(', ');

type FavoritesSearchParams = {
  q?: string;
  tags?: string[] | string;
};

type RemoveFavoriteContext = {
  previousFavorites: UserPromptFavorite[];
};

export const FavoritesPage = () => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;
  const navigate = useNavigate({ from: '/favorites' });
  const searchParams = useSearch({ from: '/favorites' }) as FavoritesSearchParams;
  const [searchInput, setSearchInput] = useState(() => buildSearchParam(searchParams.q ?? ''));
  const [tagsInput, setTagsInput] = useState(() => joinTags(parseTagsParam(searchParams.tags)));
  const activeTags = useMemo(() => parseTagsParam(searchParams.tags), [searchParams.tags]);
  const searchTerm = useMemo(() => buildSearchParam(searchParams.q ?? ''), [searchParams.q]);
  const queryClient = useQueryClient();

  const favoritesQueryKeyValue = useMemo(
    () => userPromptFavoritesQueryKey(userId, { search: searchTerm, tags: activeTags }),
    [userId, searchTerm, activeTags],
  );

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    setTagsInput(joinTags(activeTags));
  }, [activeTags]);

  const favoritesQuery = useQuery(
    userPromptFavoritesQueryOptions({ userId, search: searchTerm, tags: activeTags }),
  );

  const favorites = favoritesQuery.data ?? [];

  const removeFavoriteMutation = useMutation<
    void,
    Error,
    UserPromptFavorite,
    RemoveFavoriteContext | undefined
  >({
    mutationFn: async (favorite) => {
      if (!userId) {
        throw new Error('You must be signed in to manage favorites.');
      }

      await togglePromptFavorite({ promptId: favorite.promptId, userId, shouldFavorite: false });
    },
    onMutate: async (favorite) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKeyValue });
      const previousFavorites =
        queryClient.getQueryData<UserPromptFavorite[]>(favoritesQueryKeyValue) ?? [];
      const optimisticFavorites = previousFavorites.filter((item) => item.id !== favorite.id);

      queryClient.setQueryData<UserPromptFavorite[]>(favoritesQueryKeyValue, optimisticFavorites);

      return { previousFavorites } satisfies RemoveFavoriteContext;
    },
    onError: (error, _variables, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(favoritesQueryKeyValue, context.previousFavorites);
      }

      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Failed to update favorites. Please try again.';

      toast({ title: 'Failed to remove favorite', description: message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKeyValue });
    },
  });

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const rawSearch = buildSearchParam((formData.get('search') as string | null) ?? '');
      const rawTags = (formData.get('tags') as string | null) ?? '';
      const formattedTags = normalizeSearchTags(formatTags(rawTags));

      navigate({
        to: '/favorites',
        search: (previous) => ({
          ...previous,
          q: rawSearch.length > 0 ? rawSearch : undefined,
          tags: formattedTags.length > 0 ? formattedTags : undefined,
        }),
      });
    },
    [navigate],
  );

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setTagsInput('');
    navigate({
      to: '/favorites',
      search: (previous) => ({
        ...previous,
        q: undefined,
        tags: undefined,
      }),
    });
  }, [navigate]);

  const handleRemoveFavorite = useCallback(
    (favorite: UserPromptFavorite) => {
      removeFavoriteMutation.mutate(favorite);
    },
    [removeFavoriteMutation],
  );

  const handleTagFilterRemove = useCallback(
    (tag: string) => {
      const nextTags = activeTags.filter((current) => current !== tag);

      navigate({
        to: '/favorites',
        search: (previous) => ({
          ...previous,
          tags: nextTags.length > 0 ? nextTags : undefined,
        }),
      });
    },
    [activeTags, navigate],
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      const nextTags = normalizeSearchTags([...activeTags, tag]);

      navigate({
        to: '/favorites',
        search: (previous) => ({
          ...previous,
          tags: nextTags.length > 0 ? nextTags : undefined,
        }),
      });
    },
    [activeTags, navigate],
  );

  if (!userId) {
    return (
      <section className="space-y-4" aria-labelledby="favorites-heading">
        <div className="space-y-2">
          <h1 id="favorites-heading" className="text-3xl font-bold">
            Favorites
          </h1>
          <p className="text-muted-foreground">Sign in to view your saved prompts.</p>
        </div>
      </section>
    );
  }

  const isLoading = favoritesQuery.isPending;
  const isError = favoritesQuery.isError;
  const errorMessage =
    favoritesQuery.error instanceof Error
      ? favoritesQuery.error.message
      : 'Unknown error. Please try again.';

  const removePendingId = removeFavoriteMutation.variables?.id ?? null;

  return (
    <section className="space-y-6" aria-labelledby="favorites-heading">
      <header className="space-y-2">
        <h1 id="favorites-heading" className="text-3xl font-bold">
          Favorites
        </h1>
        <p className="text-muted-foreground">
          Quickly revisit the prompts you have starred across workspaces.
        </p>
      </header>

      <form
        role="search"
        aria-labelledby="favorites-filters-heading"
        className="space-y-4 rounded-lg border bg-card p-4"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <h2 id="favorites-filters-heading" className="text-lg font-semibold">
            Filters
          </h2>
          <p className="text-sm text-muted-foreground">
            Search by prompt title and narrow down favorites with tags.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="favorites-search">
              Search
            </label>
            <Input
              id="favorites-search"
              name="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value.slice(0, MAX_FILTER_INPUT_LENGTH))}
              placeholder="Search favorites"
              maxLength={MAX_FILTER_INPUT_LENGTH}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="favorites-tags">
              Tags
            </label>
            <Input
              id="favorites-tags"
              name="tags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value.slice(0, MAX_FILTER_INPUT_LENGTH))}
              placeholder="tag-one, tag-two"
              maxLength={MAX_FILTER_INPUT_LENGTH}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetFilters}
            disabled={!searchTerm && activeTags.length === 0 && !searchInput && !tagsInput}
          >
            Reset
          </Button>
        </div>
      </form>

      {activeTags.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Active tag filters">
          {activeTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagFilterRemove(tag)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove tag filter ${tag}`}
            >
              <span>#{tag}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="favorites-results-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="favorites-results-heading" className="text-xl font-semibold">
            Saved prompts
          </h2>
          <p className="text-sm text-muted-foreground">
            Click a tag to add it as a filter or remove a prompt from your favorites.
          </p>
        </div>

        {isLoading ? (
          <div role="status" aria-live="polite" className="space-y-4" aria-busy="true">
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <p className="text-sm text-muted-foreground">Loading favorites…</p>
          </div>
        ) : null}

        {isError ? (
          <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="font-medium text-destructive-foreground">Failed to load favorites.</p>
            <p className="text-sm text-destructive-foreground">{errorMessage}</p>
            <Button type="button" variant="outline" onClick={() => favoritesQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!isLoading && !isError && favorites.length === 0 ? (
          <div className="space-y-2 rounded-lg border bg-card p-6 text-center">
            <p className="text-lg font-semibold">No favorites yet</p>
            <p className="text-sm text-muted-foreground">
              Star prompts from any workspace to see them listed here.
            </p>
          </div>
        ) : null}

        {!isLoading && !isError && favorites.length > 0 ? (
          <ul className="space-y-4">
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <article className="space-y-3 rounded-lg border bg-card p-4" aria-label={`Favorite prompt ${favorite.promptTitle}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{favorite.promptTitle}</h3>
                      <p className="text-sm text-muted-foreground">
                        {favorite.workspaceName} · Saved on{' '}
                        {new Date(favorite.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveFavorite(favorite)}
                      disabled={removeFavoriteMutation.isPending && removePendingId === favorite.id}
                    >
                      Remove
                    </Button>
                  </div>
                  {favorite.promptNote ? (
                    <p className="text-sm text-muted-foreground">Note: {favorite.promptNote}</p>
                  ) : null}
                  {favorite.promptTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {favorite.promptTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleTagClick(tag)}
                          className="rounded-full bg-muted px-3 py-1 transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Filter favorites by tag ${tag}`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
};
