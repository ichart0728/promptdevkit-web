import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { ManageWorkspaceDialog } from '../ManageWorkspaceDialog';
import { WorkspaceContext, type WorkspaceContextValue } from '../../contexts/WorkspaceContext';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const manageWorkspaceMock = vi.fn();

vi.mock('../../api/workspaces', () => ({
  manageWorkspace: (...args: Parameters<typeof manageWorkspaceMock>) => manageWorkspaceMock(...args),
  workspacesQueryKey: (userId: string | null) => ['workspaces', userId ?? 'anonymous'] as const,
}));

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<typeof toastMock>) => toastMock(...args),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

type WorkspaceShape = NonNullable<WorkspaceContextValue['activeWorkspace']>;

const buildWorkspace = (overrides: Partial<WorkspaceShape> = {}): WorkspaceShape => ({
  id: 'workspace-1',
  name: 'Personal Space',
  type: 'personal' as const,
  teamId: null,
  archivedAt: null,
  ...overrides,
});

const createContextValue = (overrides: Partial<WorkspaceContextValue> = {}): WorkspaceContextValue => ({
  workspaces: [],
  activeWorkspace: buildWorkspace(),
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn().mockResolvedValue([]),
  hasSession: true,
  ...overrides,
});

const renderDialog = (contextOverrides: Partial<WorkspaceContextValue> = {}) => {
  const queryClient = createQueryClient();
  const value = createContextValue(contextOverrides);

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={value}>
        <ManageWorkspaceDialog />
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient, contextValue: value };
};

describe('ManageWorkspaceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
    manageWorkspaceMock.mockResolvedValue(buildWorkspace());
  });

  it('validates the workspace name before renaming', async () => {
    renderDialog();

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    const nameInput = await screen.findByLabelText('Workspace name');

    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Workspace name is required')).toBeInTheDocument();
    expect(manageWorkspaceMock).not.toHaveBeenCalled();
  });

  it('renames the workspace and refreshes the list', async () => {
    const refetchMock = vi.fn().mockResolvedValue([]);
    manageWorkspaceMock.mockResolvedValue(buildWorkspace({ name: 'Renamed Space' }));

    const { queryClient } = renderDialog({ refetch: refetchMock });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    const nameInput = await screen.findByLabelText('Workspace name');

    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Space');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(manageWorkspaceMock).toHaveBeenCalled();
    });

    const renameCall = manageWorkspaceMock.mock.calls.at(-1)?.[0];

    expect(renameCall).toEqual({
      workspaceId: 'workspace-1',
      action: 'rename',
      name: 'Renamed Space',
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['workspaces', 'user-1'] });
      expect(refetchMock).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Workspace renamed',
        description: 'Workspace name updated to “Renamed Space”.',
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Manage workspace' })).not.toBeInTheDocument();
    });
  });

  it('archives the workspace and shows a confirmation toast', async () => {
    const refetchMock = vi.fn().mockResolvedValue([]);
    manageWorkspaceMock.mockResolvedValue(
      buildWorkspace({ archivedAt: '2024-01-01T00:00:00Z' }),
    );

    renderDialog({ refetch: refetchMock });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Archive workspace' }));

    await waitFor(() => {
      expect(manageWorkspaceMock).toHaveBeenCalled();
    });

    const archiveCall = manageWorkspaceMock.mock.calls.at(-1)?.[0];

    expect(archiveCall).toEqual({
      workspaceId: 'workspace-1',
      action: 'archive',
    });

    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Workspace archived',
        description: 'Members will no longer see this workspace until it is restored.',
      });
    });
  });

  it('restores an archived workspace and shows a confirmation toast', async () => {
    const refetchMock = vi.fn().mockResolvedValue([]);
    manageWorkspaceMock.mockResolvedValue(buildWorkspace({ archivedAt: null }));

    renderDialog({
      activeWorkspace: buildWorkspace({ archivedAt: '2024-01-01T00:00:00Z' }),
      workspaces: [],
      refetch: refetchMock,
    });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Restore workspace' }));

    await waitFor(() => {
      expect(manageWorkspaceMock).toHaveBeenCalled();
    });

    const restoreCall = manageWorkspaceMock.mock.calls.at(-1)?.[0];

    expect(restoreCall).toEqual({
      workspaceId: 'workspace-1',
      action: 'restore',
    });

    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Workspace restored',
        description: 'The workspace is active again.',
      });
    });
  });
});
