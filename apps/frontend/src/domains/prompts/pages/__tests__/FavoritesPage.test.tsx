import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { vi } from 'vitest';

import { FavoritesPage } from '../FavoritesPage';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import {
  fetchUserPromptFavorites,
  togglePromptFavorite,
  userPromptFavoritesQueryOptions,
} from '@/domains/prompts/api/promptFavorites';

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('@/domains/prompts/api/promptFavorites', () => ({
  userPromptFavoritesQueryKey: (userId: string | null, filters: { search?: string; tags?: string[] }) =>
    ['user-prompt-favorites', userId, filters] as const,
  userPromptFavoritesQueryOptions: vi.fn(),
  fetchUserPromptFavorites: vi.fn(),
  togglePromptFavorite: vi.fn(),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);
const useSearchMock = vi.mocked(useSearch);
const useNavigateMock = vi.mocked(useNavigate);
const fetchUserPromptFavoritesMock = vi.mocked(fetchUserPromptFavorites);
const userPromptFavoritesQueryOptionsMock = vi.mocked(userPromptFavoritesQueryOptions);
const togglePromptFavoriteMock = vi.mocked(togglePromptFavorite);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderFavoritesPage = () => {
  const queryClient = createTestQueryClient();

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <FavoritesPage />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
};

const buildSessionQueryValue = () =>
  ({
    data: { user: { id: 'user-1', email: 'demo@example.com' } },
    status: 'success',
    isPending: false,
  } as unknown as ReturnType<typeof useSessionQuery>);

describe('FavoritesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    useSearchMock.mockReturnValue({} as ReturnType<typeof useSearch>);
    const navigateSpy = vi.fn();
    useNavigateMock.mockReturnValue(navigateSpy);
    userPromptFavoritesQueryOptionsMock.mockImplementation(({ userId, search, tags }) => ({
      queryKey: [
        'user-prompt-favorites',
        userId ?? 'anonymous',
        { search: search ?? '', tags: tags ?? [] },
      ] as const,
      queryFn: () => {
        if (!userId) {
          throw new Error('User ID is required to load favorites.');
        }

        return fetchUserPromptFavoritesMock({
          userId,
          search,
          tags,
        });
      },
      enabled: !!userId,
    }) as unknown as ReturnType<typeof userPromptFavoritesQueryOptions>);
    togglePromptFavoriteMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a loading state while favorites are being fetched', async () => {
    fetchUserPromptFavoritesMock.mockReturnValue(new Promise(() => {}));

    renderFavoritesPage();

    expect(await screen.findByText('Loading favorites…')).toBeInTheDocument();
  });

  it('renders an empty state when no favorites are available', async () => {
    fetchUserPromptFavoritesMock.mockResolvedValueOnce([]);

    renderFavoritesPage();

    await waitFor(() => {
      expect(screen.getByText('No favorites yet')).toBeInTheDocument();
    });
  });

  it('renders an error state when the query fails', async () => {
    fetchUserPromptFavoritesMock.mockRejectedValueOnce(new Error('Unable to load favorites'));

    renderFavoritesPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load favorites.');
    });
    expect(screen.getByText('Unable to load favorites')).toBeInTheDocument();
  });
});
