import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptEditorDialog } from '../PromptEditorDialog';
import { promptsQueryKey, updatePrompt, type Prompt } from '../../api/prompts';
import { fetchPromptVersions, promptVersionsQueryKey } from '../../api/promptVersions';

vi.mock('../../api/prompts', () => ({
  updatePrompt: vi.fn(),
  promptsQueryKey: (workspaceId: string) => ['prompts', workspaceId] as const,
}));

vi.mock('../../api/promptVersions', () => ({
  fetchPromptVersions: vi.fn(),
  promptVersionsQueryKey: (promptId: string | null) => ['prompt-versions', promptId] as const,
}));

const updatePromptMock = vi.mocked(updatePrompt);
const fetchPromptVersionsMock = vi.mocked(fetchPromptVersions);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

type RenderPromptEditorOptions = {
  prompt?: Prompt | null;
};

const basePrompt: Prompt = {
  id: 'prompt-1',
  title: 'Weekly summary',
  body: 'Summarize the weekly updates for the product team.',
  tags: ['summary', 'weekly'],
  note: 'Keep responses short.',
};

const workspace = {
  id: 'workspace-1',
  type: 'personal' as const,
};

const renderPromptEditor = ({ prompt = basePrompt }: RenderPromptEditorOptions = {}) => {
  const queryClient = createTestQueryClient();
  const user = userEvent.setup();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <PromptEditorDialog
        open
        onOpenChange={() => {}}
        prompt={prompt ?? null}
        workspace={workspace}
        userId="user-1"
      />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient, user, invalidateSpy };
};

describe('PromptEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('validates required fields before saving', async () => {
    const { user } = renderPromptEditor();

    const titleInput = screen.getByLabelText('Title');
    const bodyTextarea = screen.getByLabelText('Prompt body');

    await user.clear(titleInput);
    await user.clear(bodyTextarea);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(await screen.findByText('Body is required')).toBeInTheDocument();
    expect(updatePromptMock).not.toHaveBeenCalled();
  });

  it('submits updates, invalidates caches, and resets the form', async () => {
    const updatedPrompt: Prompt = {
      ...basePrompt,
      title: 'Weekly summary v2',
      body: 'Summarize updates with a cheerful tone.',
      tags: ['summary', 'team'],
      note: 'Mention product highlights first.',
    };

    updatePromptMock.mockResolvedValue(updatedPrompt);

    const { user, queryClient, invalidateSpy } = renderPromptEditor();

    queryClient.setQueryData(promptsQueryKey(workspace.id), [basePrompt]);

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Weekly summary v2');
    await user.clear(screen.getByLabelText('Prompt body'));
    await user.type(screen.getByLabelText('Prompt body'), 'Summarize updates with a cheerful tone.');
    await user.clear(screen.getByLabelText('Tags'));
    await user.type(screen.getByLabelText('Tags'), 'summary, team');
    await user.clear(screen.getByLabelText('Internal note (optional)'));
    await user.type(screen.getByLabelText('Internal note (optional)'), 'Mention product highlights first.');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(screen.getByText('Prompt updated successfully.')).toBeInTheDocument();
    });

    expect(updatePromptMock).toHaveBeenCalledWith({
      workspace,
      userId: 'user-1',
      promptId: 'prompt-1',
      title: 'Weekly summary v2',
      body: 'Summarize updates with a cheerful tone.',
      tags: ['summary', 'team'],
      note: 'Mention product highlights first.',
    });

    const updatedData = queryClient.getQueryData<Prompt[]>(promptsQueryKey(workspace.id));
    expect(updatedData).toEqual([updatedPrompt]);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: promptsQueryKey(workspace.id) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: promptVersionsQueryKey(basePrompt.id) });
  });

  it('loads prompt versions when switching to the history tab', async () => {
    fetchPromptVersionsMock.mockResolvedValue([
      {
        id: 'version-2',
        promptId: 'prompt-1',
        version: 2,
        title: 'Weekly summary v2',
        body: 'Summarize updates with a cheerful tone.',
        note: 'Mention product highlights first.',
        tags: ['summary', 'team'],
        updatedBy: 'user-2',
        restoredFromVersion: 1,
        createdAt: '2024-06-01T12:00:00.000Z',
      },
    ]);

    const { user } = renderPromptEditor();

    await user.click(screen.getByRole('button', { name: 'History' }));

    await waitFor(() => {
      expect(fetchPromptVersionsMock).toHaveBeenCalledWith({ promptId: 'prompt-1' });
    });

    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText(/Updated by user-2/)).toBeInTheDocument();
  });

  it('shows a loading state while versions are fetching', async () => {
    fetchPromptVersionsMock.mockImplementation(
      () =>
        new Promise(() => {
          // Intentionally unresolved to keep the query in a loading state.
        }),
    );

    const { user } = renderPromptEditor();

    await user.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('Loading version history…')).toBeInTheDocument();
  });

  it('renders an error state and allows retry when the history fetch fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchPromptVersionsMock.mockRejectedValueOnce(new Error('Network error'));

    const { user } = renderPromptEditor();

    await user.click(screen.getByRole('button', { name: 'History' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to load version history. Please try again.')).toBeInTheDocument();
    });

    expect(fetchPromptVersionsMock).toHaveBeenCalledTimes(1);

    fetchPromptVersionsMock.mockResolvedValueOnce([]);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(fetchPromptVersionsMock).toHaveBeenCalledTimes(2);
    });

    consoleErrorSpy.mockRestore();
  });
});

