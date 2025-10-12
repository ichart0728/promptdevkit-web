import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { PromptEditorDialog } from '../PromptEditorDialog';
import { promptsQueryKey, updatePrompt, type Prompt } from '../../api/prompts';
import {
  fetchPromptVersions,
  promptVersionsQueryKey,
  restorePromptVersion,
} from '../../api/promptVersions';
import type * as ToastModule from '@/components/common/toast';

vi.mock('../../api/prompts', () => ({
  updatePrompt: vi.fn(),
  promptsQueryKey: (workspaceId: string) => ['prompts', workspaceId] as const,
}));

vi.mock('../../api/promptVersions', () => ({
  fetchPromptVersions: vi.fn(),
  promptVersionsQueryKey: (promptId: string | null) => ['prompt-versions', promptId] as const,
  restorePromptVersion: vi.fn(),
}));

type ToastFn = typeof ToastModule.toast;

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<ToastFn>) => toastMock(...args),
}));

const updatePromptMock = vi.mocked(updatePrompt);
const fetchPromptVersionsMock = vi.mocked(fetchPromptVersions);
const restorePromptVersionMock = vi.mocked(restorePromptVersion);

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

  it('restores a prompt version, updates the form, and invalidates caches', async () => {
    fetchPromptVersionsMock.mockResolvedValue([
      {
        id: 'version-2',
        promptId: 'prompt-1',
        version: 2,
        title: 'Weekly summary restored',
        body: 'Restored body of the prompt.',
        note: 'Restored note.',
        tags: ['restored', 'tags'],
        updatedBy: 'user-2',
        restoredFromVersion: null,
        createdAt: '2024-06-02T12:00:00.000Z',
      },
    ]);

    const restoredPrompt: Prompt = {
      ...basePrompt,
      title: 'Weekly summary restored',
      body: 'Restored body of the prompt.',
      tags: ['restored', 'tags'],
      note: 'Restored note.',
    };

    restorePromptVersionMock.mockResolvedValue(restoredPrompt);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { user, queryClient, invalidateSpy } = renderPromptEditor();

    queryClient.setQueryData(promptsQueryKey(workspace.id), [basePrompt]);

    await user.click(screen.getByRole('button', { name: 'History' }));

    await waitFor(() => {
      expect(fetchPromptVersionsMock).toHaveBeenCalledWith({ promptId: 'prompt-1' });
    });

    const restoreButton = await screen.findByRole('button', { name: 'Restore' });

    await user.click(restoreButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to restore version 2? This will replace the current prompt content.',
    );

    await waitFor(() => {
      expect(restorePromptVersionMock).toHaveBeenCalledWith({ promptId: 'prompt-1', version: 2 });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Title')).toHaveValue('Weekly summary restored');
    expect(screen.getByLabelText('Prompt body')).toHaveValue('Restored body of the prompt.');
    expect(screen.getByLabelText('Tags')).toHaveValue('restored, tags');
    expect(screen.getByLabelText('Internal note (optional)')).toHaveValue('Restored note.');
    expect(screen.getByText('Prompt version restored successfully.')).toBeInTheDocument();

    const updatedData = queryClient.getQueryData<Prompt[]>(promptsQueryKey(workspace.id));
    expect(updatedData).toEqual([restoredPrompt]);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: promptsQueryKey(workspace.id) });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: promptVersionsQueryKey(basePrompt.id) });
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Prompt version restored',
        description: 'Version 2 has been restored.',
      });
    });

    confirmSpy.mockRestore();
  });
});

