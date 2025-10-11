import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import type { Prompt } from '@/domains/prompts/api/prompts';
import { PromptsPage } from './PromptsPage';
import { fetchPrompts, createPrompt } from '@/domains/prompts/api/prompts';
import { fetchPlanLimits, fetchUserPlanId } from '@/domains/prompts/api/planLimits';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

vi.mock('@/components/common/UpgradeDialog', () => ({
  UpgradeDialog: ({ open }: { open: boolean }) =>
    open ? <div>Upgrade to unlock more capacity</div> : null,
}));

vi.mock('@/domains/prompts/api/prompts', () => ({
  promptsQueryKey: (workspaceId: string) => ['prompts', workspaceId] as const,
  fetchPrompts: vi.fn(),
  createPrompt: vi.fn(),
}));

vi.mock('@/domains/prompts/api/planLimits', () => ({
  userPlanQueryKey: (userId: string | null) => ['user-plan', userId] as const,
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
  fetchUserPlanId: vi.fn(),
  fetchPlanLimits: vi.fn(),
}));

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const fetchPromptsMock = vi.mocked(fetchPrompts);
const createPromptMock = vi.mocked(createPrompt);
const fetchUserPlanIdMock = vi.mocked(fetchUserPlanId);
const fetchPlanLimitsMock = vi.mocked(fetchPlanLimits);
const useSessionQueryMock = vi.mocked(useSessionQuery);

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

describe('PromptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    fetchUserPlanIdMock.mockResolvedValue('free');
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 20,
        value_str: null,
        value_json: null,
      },
    });
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
      workspaceId: '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf',
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

  it('recommends an upgrade when the prompt limit is reached', async () => {
    fetchPromptsMock.mockResolvedValue([]);
    fetchPlanLimitsMock.mockResolvedValue({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 1,
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
});
