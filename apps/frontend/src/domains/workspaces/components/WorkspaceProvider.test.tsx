import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import type { Workspace } from '../api/workspaces';
import { WorkspaceProvider } from './WorkspaceProvider';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const fetchWorkspacesMock = vi.fn(async (_userId: string | null) => [] as Workspace[]);

vi.mock('../api/workspaces', () => ({
  workspacesQueryOptions: (userId: string | null) => ({
    queryKey: ['workspaces', userId ?? 'anonymous'] as const,
    queryFn: () => fetchWorkspacesMock(userId),
  }),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const TestConsumer = () => {
  const { activeWorkspace, workspaces, isLoading, hasSession, setActiveWorkspaceId } = useWorkspaceContext();

  return (
    <div>
      <span data-testid="has-session">{hasSession ? 'yes' : 'no'}</span>
      <span data-testid="active-workspace">{activeWorkspace?.id ?? 'none'}</span>
      <span data-testid="workspace-count">{workspaces.length}</span>
      <span data-testid="loading-state">{isLoading ? 'loading' : 'idle'}</span>
      <button type="button" onClick={() => setActiveWorkspaceId('workspace-2')}>
        Select workspace-2
      </button>
    </div>
  );
};

const renderWithProvider = (queryClient = createQueryClient()) => {
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <TestConsumer />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
};

const buildWorkspace = (id: string, overrides: Partial<Workspace> = {}): Workspace => ({
  id,
  name: `Workspace ${id}`,
  type: 'personal',
  teamId: null,
  ...overrides,
});

describe('WorkspaceProvider', () => {
  let sessionState: ReturnType<typeof useSessionQuery>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionState = {
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>;
    useSessionQueryMock.mockImplementation(() => sessionState);
  });

  it('exposes a loading state while workspaces load', () => {
    fetchWorkspacesMock.mockReturnValue(new Promise<Workspace[]>(() => {}));

    renderWithProvider();

    expect(screen.getByTestId('has-session')).toHaveTextContent('yes');
    expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');
  });

  it('defaults to no active workspace when the list is empty', async () => {
    fetchWorkspacesMock.mockResolvedValue([]);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-count')).toHaveTextContent('0');
    });

    expect(screen.getByTestId('active-workspace')).toHaveTextContent('none');
  });

  it('allows selecting a different workspace', async () => {
    fetchWorkspacesMock.mockResolvedValue([
      buildWorkspace('workspace-1'),
      buildWorkspace('workspace-2'),
    ]);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Select workspace-2' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-2');
    });
  });

  it('clears the active workspace when the session ends', async () => {
    fetchWorkspacesMock.mockResolvedValue([buildWorkspace('workspace-1')]);

    const { rerender, queryClient } = renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1');
    });

    act(() => {
      sessionState = {
        ...sessionState,
        data: null,
      } as typeof sessionState;
      useSessionQueryMock.mockImplementation(() => sessionState);
      rerender(
        <QueryClientProvider client={queryClient}>
          <WorkspaceProvider>
            <TestConsumer />
          </WorkspaceProvider>
        </QueryClientProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('none');
    });
  });
});
