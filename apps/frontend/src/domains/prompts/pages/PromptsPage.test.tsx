import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { vi } from 'vitest';
import type { PostgrestError } from '@supabase/postgrest-js';

import type { Prompt } from '@/domains/prompts/api/prompts';
import { PromptsPage } from './PromptsPage';
import { fetchPrompts, createPrompt, deletePrompt } from '@/domains/prompts/api/prompts';
import { fetchPlanLimits, fetchUserPlanId } from '@/domains/prompts/api/planLimits';
import { fetchPromptFavorite, togglePromptFavorite } from '@/domains/prompts/api/promptFavorites';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useActiveWorkspace } from '@/domains/workspaces/hooks/useActiveWorkspace';

vi.mock('@/components/common/UpgradeDialog', () => ({
  UpgradeDialog: ({ open }: { open: boolean; onResetEvaluation?: () => void }) =>
    open ? <div>Upgrade to unlock more capacity</div> : null,
}));

vi.mock('@/domains/prompts/api/prompts', () => ({
  promptsQueryKey: (workspaceId: string) => ['prompts', workspaceId] as const,
  fetchPrompts: vi.fn(),
  createPrompt: vi.fn(),
  deletePrompt: vi.fn(),
}));

vi.mock('@/domains/prompts/api/planLimits', () => ({
  userPlanQueryKey: (userId: string | null) => ['user-plan', userId] as const,
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
  fetchUserPlanId: vi.fn(),
  fetchPlanLimits: vi.fn(),
}));

vi.mock('@/domains/prompts/api/promptFavorites', () => ({
  promptFavoritesQueryKey: (promptId: string | null) => ['prompt-favorites', promptId] as const,
  fetchPromptFavorite: vi.fn(),
  togglePromptFavorite: vi.fn(),
}));

vi.mock('../components/PromptEditorDialog', () => ({
  PromptEditorDialog: () => null,
}));

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));
vi.mock('@/domains/workspaces/hooks/useActiveWorkspace', () => ({
  useActiveWorkspace: vi.fn(),
}));

const fetchPromptsMock = vi.mocked(fetchPrompts);
const createPromptMock = vi.mocked(createPrompt);
const deletePromptMock = vi.mocked(deletePrompt);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);
const fetchPromptFavoriteMock = vi.mocked(fetchPromptFavorite);
const togglePromptFavoriteMock = vi.mocked(togglePromptFavorite);
const useSessionQueryMock = vi.mocked(useSessionQuery);
const useActiveWorkspaceMock = vi.mocked(useActiveWorkspace);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
type RouterProviderProps = Parameters<typeof RouterProvider>[0];
type AppRouter = RouterProviderProps['router'];

const createTestRouter = (queryClient: QueryClient, initialSearch = '') => {
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });

  const promptsTestRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/prompts',
    component: PromptsPage,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([promptsTestRoute]),
    history: createMemoryHistory({ initialEntries: [`/prompts${initialSearch}`] }),
    defaultPreload: 'intent',
  });

  return router as unknown as AppRouter;
};

const renderPromptsPage = (options: { initialSearch?: string } = {}) => {
  const queryClient = createTestQueryClient();
  const router = createTestRouter(queryClient, options.initialSearch ?? '');

  const renderResult = render(<RouterProvider router={router} />);

  return { ...renderResult, queryClient, router };
};

const buildSessionQueryValue = (
  overrides: Partial<ReturnType<typeof useSessionQuery>> = {},
) =>
  ({
    data: { user: { id: 'user-1', email: 'demo@example.com' } },
    status: 'success',
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSessionQuery>);

const personalWorkspace = {
  id: 'workspace-1',
  name: 'Personal Space',
  type: 'personal' as const,
  teamId: null,
  archivedAt: null,
};

const teamWorkspace = {
  id: 'workspace-2',
  name: 'Team Space',
  type: 'team' as const,
  teamId: 'team-123',
  archivedAt: null,
};

let activeWorkspaceRef: { current: typeof personalWorkspace | typeof teamWorkspace | null };

describe('PromptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    activeWorkspaceRef = { current: personalWorkspace };
    useActiveWorkspaceMock.mockImplementation(() => activeWorkspaceRef.current);
    fetchUserPlanIdMock.mockResolvedValue('free');
    deletePromptMock.mockResolvedValue('prompt-1');
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 20,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    fetchPromptFavoriteMock.mockResolvedValue(null);
    togglePromptFavoriteMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a loading state while prompts are fetching', async () => {
    fetchPromptsMock.mockReturnValue(new Promise<Prompt[]>(() => {}));

    renderPromptsPage();

    expect(await screen.findByText('Loading prompts…')).toBeInTheDocument();
  });

  it('renders the empty state when no prompts exist', async () => {
    fetchPromptsMock.mockResolvedValue([]);

    renderPromptsPage();

    await waitFor(() => {
      expect(screen.getByText('No prompts yet. Use the form to add your first template.')).toBeInTheDocument();
    });
  });

  it('renders an error state when the query fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchPromptsMock.mockRejectedValueOnce(new Error('Network error'));

    renderPromptsPage();

    await screen.findByText('Failed to load prompts. Network error');

    consoleErrorSpy.mockRestore();
  });

  it('shows optimistic updates when creating a prompt', async () => {
    fetchPromptsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'prompt-1',
          title: 'New prompt',
          body: 'Generate a project summary.',
          tags: ['summary', 'weekly'],
        },
      ]);
    const user = userEvent.setup();
    let resolveMutation: ((prompt: Prompt) => void) | null = null;

    createPromptMock.mockImplementation(() =>
      new Promise<Prompt>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    renderPromptsPage();

    await screen.findByRole('button', { name: 'Create prompt' });

    await user.type(screen.getByLabelText('Title'), 'New prompt');
    await user.type(screen.getByLabelText('Prompt body'), 'Generate a project summary.');
    await user.type(screen.getByLabelText('Tags'), 'summary, weekly');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create prompt' }));
    });

    await screen.findByText('(saving…)');
    expect(createPromptMock).toHaveBeenCalledWith({
      workspace: personalWorkspace,
      userId: 'user-1',
      title: 'New prompt',
      body: 'Generate a project summary.',
      tags: ['summary', 'weekly'],
    });

    if (!resolveMutation) {
      throw new Error('Expected the mutation resolver to be defined.');
    }

    (resolveMutation as (prompt: Prompt) => void)({
      id: 'prompt-1',
      title: 'New prompt',
      body: 'Generate a project summary.',
      tags: ['summary', 'weekly'],
    });

    await waitFor(() => {
      expect(screen.queryByText('(saving…)')).not.toBeInTheDocument();
    });

    await screen.findByRole('heading', { level: 3, name: 'New prompt' });
    await screen.findByText('#summary');
  });

  it('toggles prompt favorites and filters the list', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: [],
      },
      {
        id: 'prompt-2',
        title: 'Prompt Beta',
        body: 'Summarize the meeting notes.',
        tags: [],
      },
    ]);
    const favoriteIds = new Set(['prompt-2']);
    fetchPromptFavoriteMock.mockImplementation(async ({ promptId }) =>
      favoriteIds.has(promptId)
        ? {
            id: 'favorite-1',
            promptId,
            userId: 'user-1',
            createdAt: new Date().toISOString(),
          }
        : null,
    );
    togglePromptFavoriteMock.mockImplementation(async ({ promptId, shouldFavorite }) => {
      if (shouldFavorite) {
        favoriteIds.add(promptId);
        return {
          id: 'favorite-2',
          promptId,
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        };
      }

      favoriteIds.delete(promptId);
      return null;
    });
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    const favoritesToggle = await screen.findByRole('button', {
      name: 'Toggle favorite for prompt Prompt Beta',
    });
    expect(favoritesToggle).toHaveAttribute('aria-pressed', 'true');

    const filterButton = await screen.findByRole('button', { name: 'Show favorites only' });
    await user.click(filterButton);

    await screen.findByRole('heading', { level: 3, name: 'Prompt Beta' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Prompt Alpha' })).not.toBeInTheDocument();

    await user.click(favoritesToggle);

    await waitFor(() => {
      expect(togglePromptFavoriteMock).toHaveBeenCalledWith({
        promptId: 'prompt-2',
        userId: 'user-1',
        shouldFavorite: false,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Toggle favorite for prompt Prompt Beta' })).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Show all prompts' }));

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Toggle favorite for prompt Prompt Beta' }),
      ).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('filters prompts using the search form and syncs filters to the URL', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Meeting summary',
        body: 'Summarize weekly standups.',
        tags: ['meeting', 'weekly'],
      },
      {
        id: 'prompt-2',
        title: 'Retro checklist',
        body: 'Guide the team retrospective.',
        tags: ['retro', 'team', 'weekly'],
      },
      {
        id: 'prompt-3',
        title: 'Launch plan',
        body: 'Coordinate the next product launch.',
        tags: ['launch', 'product'],
      },
    ]);
    const user = userEvent.setup();

    const { router } = renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Meeting summary' });

    await user.type(screen.getByLabelText('Search prompts'), 'weekly');
    await user.type(screen.getByLabelText('Filter tags'), 'team, weekly');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    });

    await screen.findByRole('heading', { level: 3, name: 'Retro checklist' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Meeting summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Launch plan' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: 'weekly', tags: ['team', 'weekly'] });
      const params = new URLSearchParams(router.state.location.searchStr);
      expect(params.get('q')).toBe('weekly');
      expect(JSON.parse(params.get('tags') ?? '[]')).toEqual(['team', 'weekly']);
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Reset' }));
    });

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
      expect(router.state.location.searchStr).toBe('');
    });

    await screen.findByRole('heading', { level: 3, name: 'Meeting summary' });
    await screen.findByRole('heading', { level: 3, name: 'Retro checklist' });
    await screen.findByRole('heading', { level: 3, name: 'Launch plan' });
  });

  it('restores filters from the URL on load', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Meeting summary',
        body: 'Summarize weekly standups.',
        tags: ['meeting', 'weekly'],
      },
      {
        id: 'prompt-2',
        title: 'Retro checklist',
        body: 'Guide the team retrospective.',
        tags: ['retro', 'team', 'weekly'],
      },
      {
        id: 'prompt-3',
        title: 'Launch plan',
        body: 'Coordinate the next product launch.',
        tags: ['launch', 'product'],
      },
    ]);

    const { router } = renderPromptsPage({ initialSearch: '?q=retro&tags=team&tags=weekly' });

    await screen.findByRole('heading', { level: 3, name: 'Retro checklist' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Meeting summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Launch plan' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search prompts')).toHaveValue('retro');
    expect(screen.getByLabelText('Filter tags')).toHaveValue('team, weekly');

    expect(router.state.location.search).toEqual({ q: 'retro', tags: ['team', 'weekly'] });
    const params = new URLSearchParams(router.state.location.searchStr);
    expect(params.get('q')).toBe('retro');
    expect(JSON.parse(params.get('tags') ?? '[]')).toEqual(['team', 'weekly']);
  });

  it('recommends an upgrade when the prompt limit is reached', async () => {
    fetchPromptsMock.mockResolvedValue([]);
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 1,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    const user = userEvent.setup();

    createPromptMock.mockResolvedValue({
      id: 'prompt-1',
      title: 'Edge case',
      body: 'Body',
      tags: [],
    });

    renderPromptsPage();

    await screen.findByRole('button', { name: 'Create prompt' });

    await user.type(screen.getByLabelText('Title'), 'Edge case');
    await user.type(screen.getByLabelText('Prompt body'), 'Body');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create prompt' }));
    });

    await screen.findByRole('button', { name: 'Why upgrade?' });
    expect(createPromptMock).toHaveBeenCalled();
  });

  it('opens the upgrade dialog when the prompt limit is exceeded', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'existing',
        title: 'Existing prompt',
        body: 'Existing body',
        tags: [],
      },
    ]);
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 1,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('button', { name: 'Create prompt' });

    await user.type(screen.getByLabelText('Title'), 'Over limit');
    await user.type(screen.getByLabelText('Prompt body'), 'Body');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create prompt' }));
    });

    await screen.findByText('Upgrade to unlock more capacity');
    expect(createPromptMock).not.toHaveBeenCalled();
  });

  it('opens the upgrade dialog when Supabase rejects the mutation due to plan limits', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'existing',
        title: 'Existing prompt',
        body: 'Existing body',
        tags: [],
      },
    ]);

    const planLimitError = {
      name: 'PostgrestError',
      message: 'Prompt quota reached',
      details: 'Current plan allows 1 prompt.',
      hint: 'Upgrade to add more capacity.',
      code: 'P0001',
    } satisfies Partial<PostgrestError> & { code: string };

    createPromptMock.mockRejectedValueOnce(planLimitError);
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('button', { name: 'Create prompt' });

    await user.type(screen.getByLabelText('Title'), 'Over quota');
    await user.type(screen.getByLabelText('Prompt body'), 'Body');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create prompt' }));
    });

    await screen.findByText(
      'You have reached your prompt limit for this workspace. Current plan allows 1 prompt. Upgrade to add more capacity.',
    );
    await screen.findByText('Upgrade to unlock more capacity');

    expect(createPromptMock).toHaveBeenCalledTimes(1);
  });

  it('deletes a prompt and updates plan usage counts and evaluation state', async () => {
    fetchPromptsMock.mockResolvedValueOnce([
      {
        id: 'prompt-1',
        title: 'Existing prompt',
        body: 'Existing body',
        tags: [],
      },
    ]);
    fetchPromptsMock.mockResolvedValue([]);
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 1,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
    deletePromptMock.mockResolvedValueOnce('prompt-1');
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Existing prompt' });
    await screen.findByText('Current usage in Personal Space: 1 of 1 prompts');

    await user.type(screen.getByLabelText('Title'), 'Second prompt');
    await user.type(screen.getByLabelText('Prompt body'), 'Body');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Create prompt' }));
    });

    await screen.findByRole('button', { name: 'Why upgrade?' });

    await user.click(screen.getByRole('button', { name: 'Delete prompt Existing prompt' }));

    const dialog = await screen.findByRole('dialog');

    await act(async () => {
      await user.click(within(dialog).getByRole('button', { name: 'Delete prompt' }));
    });

    await waitFor(() => {
      expect(deletePromptMock).toHaveBeenCalledWith({
        workspace: personalWorkspace,
        userId: 'user-1',
        promptId: 'prompt-1',
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Current usage in Personal Space: 0 of 1 prompts'),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Existing prompt' })).not.toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Why upgrade?' })).not.toBeInTheDocument();
  });
});

describe('PromptsPage workspace awareness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    activeWorkspaceRef = { current: personalWorkspace };
    useActiveWorkspaceMock.mockImplementation(() => activeWorkspaceRef.current);
    fetchUserPlanIdMock.mockResolvedValue('free');
    deletePromptMock.mockResolvedValue('prompt-1');
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 2,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 1,
        value_str: null,
        value_json: null,
      },
    });
    fetchPromptFavoriteMock.mockResolvedValue(null);
    togglePromptFavoriteMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows workspace metadata in the header', async () => {
    fetchPromptsMock.mockResolvedValue([]);

    renderPromptsPage();

    await screen.findByText('Workspace: Personal Space');
    await screen.findByText('Current usage in Personal Space: 0 of 2 prompts');
  });

  it('switches plan limit keys when the active workspace changes', async () => {
    fetchPromptsMock.mockResolvedValue([]);

    const { unmount } = renderPromptsPage();

    await screen.findByText('Current usage in Personal Space: 0 of 2 prompts');
    expect(fetchPromptsMock).toHaveBeenLastCalledWith({ workspace: personalWorkspace });

    activeWorkspaceRef.current = teamWorkspace;
    fetchPromptsMock.mockResolvedValueOnce([]);

    await act(async () => {
      unmount();
    });

    renderPromptsPage();

    await screen.findByText('Team workspace');
    expect(fetchPromptsMock).toHaveBeenLastCalledWith({ workspace: teamWorkspace });
    await screen.findByText('Current usage in Team Space: 0 of 1 prompts');
  });
});
