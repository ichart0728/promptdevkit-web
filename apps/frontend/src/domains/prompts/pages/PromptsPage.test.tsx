import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { vi } from 'vitest';
import type { PostgrestError } from '@supabase/postgrest-js';

import type { Prompt } from '@/domains/prompts/api/prompts';
import type { PromptEditorDialogProps } from '../components/PromptEditorDialog';
import { PromptsPage } from './PromptsPage';
import { fetchPrompts, createPrompt, deletePrompt, duplicatePrompt } from '@/domains/prompts/api/prompts';
import { fetchTrashedPrompts, purgePrompt, restorePrompt } from '@/domains/prompts/api/promptTrash';
import { fetchPlanLimits, fetchUserPlanId } from '@/domains/prompts/api/planLimits';
import { fetchPromptFavorite, togglePromptFavorite } from '@/domains/prompts/api/promptFavorites';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useActiveWorkspace } from '@/domains/workspaces/hooks/useActiveWorkspace';
import { toast } from '@/components/common/toast';
import { copyToClipboard, ClipboardUnavailableError } from '@/lib/clipboard';
import type * as clipboardModuleType from '@/lib/clipboard';

vi.mock('@/components/common/UpgradeDialog', () => ({
  UpgradeDialog: ({ open }: { open: boolean; onResetEvaluation?: () => void }) =>
    open ? <div>Upgrade to unlock more capacity</div> : null,
}));

vi.mock('@/components/common/toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/clipboard', async () => {
  const actual = (await vi.importActual('@/lib/clipboard')) as typeof clipboardModuleType;

  return {
    ...actual,
    copyToClipboard: vi.fn(),
  };
});

vi.mock('@/domains/prompts/api/prompts', () => ({
  promptsQueryKey: (workspaceId: string) => ['prompts', workspaceId] as const,
  fetchPrompts: vi.fn(),
  createPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  duplicatePrompt: vi.fn(),
}));

vi.mock('@/domains/prompts/api/promptTrash', () => ({
  trashedPromptsQueryKey: (workspaceId: string) => ['prompts', workspaceId, 'trash'] as const,
  fetchTrashedPrompts: vi.fn(),
  restorePrompt: vi.fn(),
  purgePrompt: vi.fn(),
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

let lastPromptEditorDialogProps: PromptEditorDialogProps | null = null;

vi.mock('../components/PromptEditorDialog', () => ({
  PromptEditorDialog: (props: PromptEditorDialogProps) => {
    lastPromptEditorDialogProps = props;
    return null;
  },
}));

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));
vi.mock('@/domains/workspaces/hooks/useActiveWorkspace', () => ({
  useActiveWorkspace: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: vi.fn(),
  useNavigate: vi.fn(),
}));

const fetchPromptsMock = vi.mocked(fetchPrompts);
const createPromptMock = vi.mocked(createPrompt);
const deletePromptMock = vi.mocked(deletePrompt);
const duplicatePromptMock = vi.mocked(duplicatePrompt);
const fetchTrashedPromptsMock = vi.mocked(fetchTrashedPrompts);
const restorePromptMock = vi.mocked(restorePrompt);
const purgePromptMock = vi.mocked(purgePrompt);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);
const fetchPromptFavoriteMock = vi.mocked(fetchPromptFavorite);
const togglePromptFavoriteMock = vi.mocked(togglePromptFavorite);
const useSessionQueryMock = vi.mocked(useSessionQuery);
const useActiveWorkspaceMock = vi.mocked(useActiveWorkspace);
const useSearchMock = vi.mocked(useSearch);
const useNavigateMock = vi.mocked(useNavigate);
const toastMock = vi.mocked(toast);
const copyToClipboardMock = vi.mocked(copyToClipboard);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const renderPromptsPage = () => {
  const queryClient = createTestQueryClient();

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <PromptsPage />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
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

const trashedPromptFixture = {
  id: 'trashed-1',
  title: 'Deprecated prompt',
  note: 'Legacy note',
  tags: ['legacy'],
  deletedAt: '2025-01-02T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  workspaceId: personalWorkspace.id,
  workspaceName: personalWorkspace.name,
};

let activeWorkspaceRef: { current: typeof personalWorkspace | typeof teamWorkspace | null };
let currentSearchState: {
  q?: string;
  tags?: string[];
  promptId?: string;
  threadId?: string;
  commentId?: string;
};
type NavigateOptions = Parameters<ReturnType<typeof useNavigate>>[0];
let navigateSpy: ReturnType<typeof vi.fn<[NavigateOptions], Promise<void>>>;
describe('PromptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.mockReset();
    copyToClipboardMock.mockReset();
    copyToClipboardMock.mockResolvedValue(undefined);
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    activeWorkspaceRef = { current: personalWorkspace };
    useActiveWorkspaceMock.mockImplementation(() => activeWorkspaceRef.current);
    fetchUserPlanIdMock.mockResolvedValue('free');
    deletePromptMock.mockResolvedValue('prompt-1');
    fetchTrashedPromptsMock.mockResolvedValue([]);
    restorePromptMock.mockResolvedValue({
      id: 'restored-prompt',
      title: 'Restored prompt',
      body: 'Restored body',
      tags: [],
      note: null,
    });
    purgePromptMock.mockResolvedValue('prompt-1');
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
    currentSearchState = {};
    useSearchMock.mockImplementation(() => currentSearchState);
    navigateSpy = vi.fn<[NavigateOptions], Promise<void>>(async () => {});
    useNavigateMock.mockReturnValue(navigateSpy as unknown as ReturnType<typeof useNavigate>);
    lastPromptEditorDialogProps = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a loading state while prompts are fetching', () => {
    fetchPromptsMock.mockReturnValue(new Promise<Prompt[]>(() => {}));

    renderPromptsPage();

    expect(screen.getByText('Loading prompts…')).toBeInTheDocument();
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

  it('duplicates a prompt and inserts the optimistic copy at the top', async () => {
    fetchPromptsMock
      .mockResolvedValueOnce([
        {
          id: 'prompt-1',
          title: 'Prompt Alpha',
          body: 'Generate a report.',
          tags: ['report'],
        },
        {
          id: 'prompt-2',
          title: 'Prompt Beta',
          body: 'Summarize the meeting notes.',
          tags: ['meeting'],
          note: 'Remember follow-up actions.',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'prompt-3',
          title: 'Prompt Beta',
          body: 'Summarize the meeting notes.',
          tags: ['meeting'],
          note: 'Remember follow-up actions.',
        },
        {
          id: 'prompt-1',
          title: 'Prompt Alpha',
          body: 'Generate a report.',
          tags: ['report'],
        },
        {
          id: 'prompt-2',
          title: 'Prompt Beta',
          body: 'Summarize the meeting notes.',
          tags: ['meeting'],
          note: 'Remember follow-up actions.',
        },
      ]);
    const user = userEvent.setup();
    let resolveDuplicate: ((prompt: Prompt) => void) | null = null;

    duplicatePromptMock.mockImplementation(() =>
      new Promise<Prompt>((resolve) => {
        resolveDuplicate = resolve;
      }),
    );

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    await screen.findByRole('heading', { level: 3, name: 'Prompt Beta' });

    const listItems = screen.getAllByRole('listitem');
    const betaRow = within(listItems[1]);

    await user.click(betaRow.getByRole('button', { name: 'Duplicate prompt Prompt Beta' }));

    expect(duplicatePromptMock).toHaveBeenCalledWith({
      workspace: personalWorkspace,
      userId: 'user-1',
      promptId: 'prompt-2',
    });

    const optimisticListItems = screen.getAllByRole('listitem');
    expect(within(optimisticListItems[0]).getByRole('heading', { level: 3, name: 'Prompt Beta' })).toBeInTheDocument();
    expect(within(optimisticListItems[0]).getByText('(saving…)')).toBeInTheDocument();

    if (!resolveDuplicate) {
      throw new Error('Expected duplicate resolver to be defined.');
    }

    (resolveDuplicate as (prompt: Prompt) => void)({
      id: 'prompt-3',
      title: 'Prompt Beta',
      body: 'Summarize the meeting notes.',
      tags: ['meeting'],
      note: 'Remember follow-up actions.',
    });

    await waitFor(() => {
      expect(screen.queryByText('(saving…)')).not.toBeInTheDocument();
    });

    const resolvedListItems = screen.getAllByRole('listitem');
    expect(within(resolvedListItems[0]).getByRole('heading', { level: 3, name: 'Prompt Beta' })).toBeInTheDocument();
    expect(within(resolvedListItems[0]).getByText('Note: Remember follow-up actions.')).toBeInTheDocument();
    expect(within(resolvedListItems[1]).getByRole('heading', { level: 3, name: 'Prompt Alpha' })).toBeInTheDocument();
  });

  it('copies a prompt body to the clipboard', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
    ]);
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    const copyButton = await screen.findByRole('button', { name: 'Copy prompt Prompt Alpha' });

    await user.click(copyButton);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Prompt copied',
        description: 'Prompt body copied to clipboard.',
      });
    });

    expect(copyToClipboardMock).toHaveBeenCalledWith('Generate a report.');
  });

  it('shows a fallback toast when clipboard access is denied', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
    ]);
    const user = userEvent.setup();
    copyToClipboardMock.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    const copyButton = await screen.findByRole('button', { name: 'Copy prompt Prompt Alpha' });

    await user.click(copyButton);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Copy failed',
        description: 'Clipboard access was denied. Copy the prompt manually.',
      });
    });

    expect(copyToClipboardMock).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('shows an unavailable message when the clipboard API is missing', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
    ]);
    const user = userEvent.setup();
    copyToClipboardMock.mockRejectedValueOnce(new ClipboardUnavailableError());

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    const copyButton = await screen.findByRole('button', { name: 'Copy prompt Prompt Alpha' });

    await user.click(copyButton);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Copy failed',
        description: 'Clipboard is unavailable. Copy the prompt manually.',
      });
    });

    expect(copyToClipboardMock).toHaveBeenCalled();
  });

  it('opens the upgrade dialog when duplicating exceeds plan limits', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
    ]);
    const user = userEvent.setup();
    const planLimitError = {
      code: 'P0001',
      message: 'plan limit reached',
      details: 'too many prompts',
      hint: '',
    } as unknown as PostgrestError;

    duplicatePromptMock.mockRejectedValue(planLimitError);

    renderPromptsPage();

    const listItem = await screen.findByRole('listitem');
    await user.click(within(listItem).getByRole('button', { name: 'Duplicate prompt Prompt Alpha' }));

    await waitFor(() => {
      expect(duplicatePromptMock).toHaveBeenCalled();
    });

    await screen.findByText('Upgrade to unlock more capacity');
    await screen.findByText(/You have reached your prompt limit for this workspace/);
    expect(screen.getByText(/too many prompts/)).toBeInTheDocument();
    expect(screen.queryByText('(saving…)')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
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

  it('submits search filters and updates the router search params', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
      {
        id: 'prompt-2',
        title: 'Prompt Beta',
        body: 'Summarize the meeting notes.',
        tags: ['meeting', 'summary'],
      },
    ]);
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });

    await user.type(screen.getByLabelText('Search'), ' Prompt Beta ');
    await user.type(screen.getByLabelText('Tags (comma separated)'), 'Meeting, summary, meeting ');

    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(navigateSpy).toHaveBeenCalled();
    const navigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(navigateArgument).toMatchObject({ to: '.', replace: true });
    if (!navigateArgument || typeof navigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }
    expect(navigateArgument.search({})).toEqual({
      q: 'Prompt Beta',
      tags: ['meeting', 'summary'],
      promptId: undefined,
      threadId: undefined,
    });
  });

  it('clears search filters via the reset action', async () => {
    currentSearchState = { q: 'initial', tags: ['focus'] };
    useSearchMock.mockImplementation(() => currentSearchState);
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['focus'],
      },
    ]);
    const user = userEvent.setup();

    renderPromptsPage();

    await screen.findByText(
      'No prompts match your filters. Adjust your search terms or clear the tag filters to see more results.',
    );
    expect(screen.getByLabelText('Search')).toHaveValue('initial');
    expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('focus');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    const navigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(navigateArgument).toMatchObject({ to: '.', replace: true });
    if (!navigateArgument || typeof navigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }
    expect(navigateArgument.search({ q: 'initial', tags: ['focus'] })).toEqual({
      q: undefined,
      tags: undefined,
      promptId: undefined,
      threadId: undefined,
      commentId: undefined,
    });
  });

  it('applies tag filters from the prompt list, toggles them, and supports clearing', async () => {
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['Meeting', 'Summary'],
      },
      {
        id: 'prompt-2',
        title: 'Prompt Beta',
        body: 'Summarize the meeting notes.',
        tags: ['Summary'],
      },
    ]);
    const user = userEvent.setup();

    const { rerender, queryClient } = renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Alpha' });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Filter by tag Meeting' }));

    const firstNavigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(firstNavigateArgument).toMatchObject({ to: '.', replace: true });
    if (!firstNavigateArgument || typeof firstNavigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }

    const searchAfterFirstClick = firstNavigateArgument.search(currentSearchState);
    expect(searchAfterFirstClick).toEqual({
      q: undefined,
      tags: ['meeting'],
      promptId: undefined,
      threadId: undefined,
    });

    await act(async () => {
      currentSearchState = searchAfterFirstClick;
      useSearchMock.mockImplementation(() => currentSearchState);
      rerender(
        <QueryClientProvider client={queryClient}>
          <PromptsPage />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('meeting');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear filters' })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: 'Filter by tag Summary' }));

    const secondNavigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(secondNavigateArgument).toMatchObject({ to: '.', replace: true });
    if (!secondNavigateArgument || typeof secondNavigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }

    const searchAfterSecondClick = secondNavigateArgument.search(searchAfterFirstClick);
    expect(searchAfterSecondClick).toEqual({
      q: undefined,
      tags: ['meeting', 'summary'],
      promptId: undefined,
      threadId: undefined,
    });

    await act(async () => {
      currentSearchState = searchAfterSecondClick;
      useSearchMock.mockImplementation(() => currentSearchState);
      rerender(
        <QueryClientProvider client={queryClient}>
          <PromptsPage />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('meeting, summary');
    });

    await user.click(screen.getByRole('button', { name: 'Filter by tag Meeting' }));

    const thirdNavigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(thirdNavigateArgument).toMatchObject({ to: '.', replace: true });
    if (!thirdNavigateArgument || typeof thirdNavigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }

    const searchAfterRemoval = thirdNavigateArgument.search(searchAfterSecondClick);
    expect(searchAfterRemoval).toEqual({
      q: undefined,
      tags: ['summary'],
      promptId: undefined,
      threadId: undefined,
    });

    await act(async () => {
      currentSearchState = searchAfterRemoval;
      useSearchMock.mockImplementation(() => currentSearchState);
      rerender(
        <QueryClientProvider client={queryClient}>
          <PromptsPage />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('summary');
    });
    expect(screen.getByRole('button', { name: 'Clear filters' })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    const clearNavigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(clearNavigateArgument).toMatchObject({ to: '.', replace: true });
    if (!clearNavigateArgument || typeof clearNavigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }

    expect(clearNavigateArgument.search(searchAfterRemoval)).toEqual({
      q: undefined,
      tags: undefined,
      promptId: undefined,
      threadId: undefined,
      commentId: undefined,
    });

    await act(async () => {
      currentSearchState = {};
      useSearchMock.mockImplementation(() => currentSearchState);
      rerender(
        <QueryClientProvider client={queryClient}>
          <PromptsPage />
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Tags (comma separated)')).toHaveValue('');
    });
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
  });

  it('opens the prompt editor to the discussion tab when mention params are present', async () => {
    currentSearchState = { promptId: 'prompt-7', threadId: 'thread-3', commentId: 'comment-99' };
    useSearchMock.mockImplementation(() => currentSearchState);
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-7',
        title: 'Mentioned prompt',
        body: 'Review this mention.',
        tags: ['discussion'],
      },
    ]);

    renderPromptsPage();

    await waitFor(() => {
      expect(lastPromptEditorDialogProps?.open).toBe(true);
    });

    expect(lastPromptEditorDialogProps).toMatchObject({
      initialTab: 'discussion',
      initialThreadId: 'thread-3',
      initialCommentId: 'comment-99',
    });
    expect(lastPromptEditorDialogProps?.prompt).toMatchObject({ id: 'prompt-7' });

    const navigateArgument = navigateSpy.mock.calls.at(-1)?.[0];
    expect(navigateArgument).toMatchObject({ to: '.', replace: true });
    if (!navigateArgument || typeof navigateArgument.search !== 'function') {
      throw new Error('Expected navigate search reducer to be a function.');
    }

    expect(navigateArgument.search(currentSearchState)).toEqual({
      promptId: undefined,
      threadId: undefined,
      q: undefined,
      tags: undefined,
      commentId: undefined,
    });
  });

  it('filters prompts by search query and tags from the router state', async () => {
    currentSearchState = { q: 'beta', tags: ['meeting', 'summary'] };
    useSearchMock.mockImplementation(() => currentSearchState);
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
      {
        id: 'prompt-2',
        title: 'Prompt Beta',
        body: 'Summarize the meeting notes.',
        tags: ['meeting', 'summary'],
      },
      {
        id: 'prompt-3',
        title: 'Prompt Gamma',
        body: 'Draft a welcome email.',
        tags: ['welcome', 'summary'],
      },
    ]);

    renderPromptsPage();

    await screen.findByRole('heading', { level: 3, name: 'Prompt Beta' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Prompt Alpha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Prompt Gamma' })).not.toBeInTheDocument();
  });

  it('shows an empty filtered state when no prompts match the filters', async () => {
    currentSearchState = { q: 'delta', tags: ['nonexistent'] };
    useSearchMock.mockImplementation(() => currentSearchState);
    fetchPromptsMock.mockResolvedValue([
      {
        id: 'prompt-1',
        title: 'Prompt Alpha',
        body: 'Generate a report.',
        tags: ['report'],
      },
    ]);

    renderPromptsPage();

    await screen.findByText(
      'No prompts match your filters. Adjust your search terms or clear the tag filters to see more results.',
    );
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

    const { rerender, queryClient } = renderPromptsPage();

    await screen.findByText('Current usage in Personal Space: 0 of 2 prompts');
    expect(fetchPromptsMock).toHaveBeenLastCalledWith({ workspace: personalWorkspace });

    activeWorkspaceRef.current = teamWorkspace;
    fetchPromptsMock.mockResolvedValueOnce([]);

    await act(async () => {
      rerender(
        <QueryClientProvider client={queryClient}>
          <PromptsPage />
        </QueryClientProvider>,
      );
    });

    await screen.findByText('Team workspace');
    expect(fetchPromptsMock).toHaveBeenLastCalledWith({ workspace: teamWorkspace });
    await screen.findByText('Current usage in Team Space: 0 of 1 prompts');
  });

  it('loads trashed prompts when the trash tab is selected', async () => {
    const user = userEvent.setup();
    fetchPromptsMock.mockResolvedValue([]);
    fetchTrashedPromptsMock.mockResolvedValueOnce([trashedPromptFixture]);

    renderPromptsPage();

    await screen.findByText('Workspace prompts · Personal Space');

    await user.click(screen.getByRole('button', { name: 'Trash' }));

    await waitFor(() => {
      expect(fetchTrashedPromptsMock).toHaveBeenCalledWith({ workspaceId: personalWorkspace.id });
    });

    expect(screen.getByText(trashedPromptFixture.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show favorites only' })).not.toBeInTheDocument();
    expect(screen.getByText('Query key: ["prompts", "workspace-1", "trash"]')).toBeInTheDocument();
  });

  it('restores a trashed prompt back to the active list', async () => {
    const user = userEvent.setup();
    fetchPromptsMock.mockResolvedValue([]);
    fetchTrashedPromptsMock.mockResolvedValueOnce([trashedPromptFixture]);
    fetchTrashedPromptsMock.mockResolvedValue([]);
    const restoredPrompt = {
      id: trashedPromptFixture.id,
      title: 'Restored from trash',
      body: 'Recovered body',
      tags: [],
      note: null,
    } satisfies Prompt;
    restorePromptMock.mockResolvedValue(restoredPrompt);

    renderPromptsPage();

    await user.click(screen.getByRole('button', { name: 'Trash' }));

    const restoreButton = await screen.findByRole('button', {
      name: `Restore prompt ${trashedPromptFixture.title}`,
    });

    await user.click(restoreButton);

    await waitFor(() => {
      expect(restorePromptMock).toHaveBeenCalledWith({ promptId: trashedPromptFixture.id });
    });

    await waitFor(() => {
      expect(fetchTrashedPromptsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prompt restored',
        description: expect.stringContaining(trashedPromptFixture.title),
      }),
    );
  });

  it('purges a trashed prompt after confirmation', async () => {
    const user = userEvent.setup();
    fetchPromptsMock.mockResolvedValue([]);
    fetchTrashedPromptsMock.mockResolvedValueOnce([trashedPromptFixture]);
    fetchTrashedPromptsMock.mockResolvedValue([]);
    purgePromptMock.mockResolvedValue(trashedPromptFixture.id);

    renderPromptsPage();

    await user.click(screen.getByRole('button', { name: 'Trash' }));

    const purgeButton = await screen.findByRole('button', {
      name: `Delete prompt ${trashedPromptFixture.title} permanently`,
    });

    await user.click(purgeButton);

    await screen.findByRole('dialog', { name: 'Delete permanently' });

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => {
      expect(purgePromptMock).toHaveBeenCalledWith({ promptId: trashedPromptFixture.id });
    });

    await waitFor(() => {
      expect(fetchTrashedPromptsMock).toHaveBeenCalledTimes(2);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Prompt deleted permanently' }),
    );
  });
});
