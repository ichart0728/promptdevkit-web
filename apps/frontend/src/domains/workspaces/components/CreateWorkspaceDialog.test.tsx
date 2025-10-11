import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { WorkspaceContext, type WorkspaceContextValue } from '../contexts/WorkspaceContext';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const createWorkspaceMock = vi.fn();

vi.mock('../api/workspaces', () => ({
  createWorkspace: (...args: Parameters<typeof createWorkspaceMock>) => createWorkspaceMock(...args),
  workspacesQueryKey: (userId: string | null) => ['workspaces', userId ?? 'anonymous'] as const,
}));

const fetchUserPlanIdMock = vi.fn();
const fetchPlanLimitsMock = vi.fn();

vi.mock('@/domains/prompts/api/planLimits', () => ({
  fetchUserPlanId: (...args: Parameters<typeof fetchUserPlanIdMock>) => fetchUserPlanIdMock(...args),
  fetchPlanLimits: (...args: Parameters<typeof fetchPlanLimitsMock>) => fetchPlanLimitsMock(...args),
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
  userPlanQueryKey: (userId: string | null) => ['user-plan', userId ?? 'anonymous'] as const,
}));

const fetchTeamsMock = vi.fn();

vi.mock('@/domains/teams/api/teams', () => ({
  teamsQueryOptions: (userId: string | null) => ({
    queryKey: ['teams', userId ?? 'anonymous'] as const,
    queryFn: () => fetchTeamsMock(),
  }),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

const createContextValue = (overrides: Partial<WorkspaceContextValue> = {}): WorkspaceContextValue => ({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn().mockResolvedValue([]),
  hasSession: true,
  ...overrides,
});

const renderWithProviders = (contextOverrides: Partial<WorkspaceContextValue> = {}) => {
  const queryClient = createQueryClient();
  const value = createContextValue(contextOverrides);

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContext.Provider value={value}>
        <CreateWorkspaceDialog />
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient, contextValue: value };
};

const personalLimitRecord = {
  key: 'personal_workspaces',
  value_int: 5,
  value_str: null,
  value_json: null,
};

const teamLimitRecord = {
  key: 'team_workspaces',
  value_int: 5,
  value_str: null,
  value_json: null,
};

describe('CreateWorkspaceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
    fetchUserPlanIdMock.mockResolvedValue('pro');
    fetchPlanLimitsMock.mockResolvedValue({
      personal_workspaces: personalLimitRecord,
      team_workspaces: teamLimitRecord,
    });
    fetchTeamsMock.mockResolvedValue([]);
  });

  it('hides the trigger when the user is signed out', () => {
    useSessionQueryMock.mockReturnValue({
      data: null,
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);

    const { contextValue } = renderWithProviders({ hasSession: false });

    expect(screen.queryByRole('button', { name: 'New workspace' })).not.toBeInTheDocument();
    expect(contextValue.refetch).not.toHaveBeenCalled();
  });

  it('creates a personal workspace and activates it after refreshing the list', async () => {
    const workspace = {
      id: 'workspace-123',
      name: 'Sandbox',
      type: 'personal' as const,
      teamId: null,
    };
    createWorkspaceMock.mockResolvedValue(workspace);

    const refetchMock = vi.fn().mockResolvedValue([workspace]);
    const setActiveWorkspaceId = vi.fn();

    renderWithProviders({ refetch: refetchMock, setActiveWorkspaceId });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New workspace' }));

    await waitFor(() => expect(fetchUserPlanIdMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled());

    await user.type(screen.getByLabelText('Workspace name'), 'Sandbox');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalled();
    });

    const createCallArgs =
      createWorkspaceMock.mock.calls[createWorkspaceMock.mock.calls.length - 1] ?? [];

    expect(createCallArgs?.[0]).toEqual({
      name: 'Sandbox',
      type: 'personal',
      teamId: null,
    });

    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalled();
      expect(setActiveWorkspaceId).toHaveBeenCalledWith('workspace-123');
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create a new workspace' })).not.toBeInTheDocument();
    });
  });

  it('shows the upgrade dialog when the plan limit is exceeded', async () => {
    fetchPlanLimitsMock.mockResolvedValue({
      personal_workspaces: { ...personalLimitRecord, value_int: 0 },
    });

    renderWithProviders();

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New workspace' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled());

    await user.type(screen.getByLabelText('Workspace name'), 'Overflow');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(createWorkspaceMock).not.toHaveBeenCalled();
      expect(screen.getByText('Upgrade to unlock more capacity')).toBeInTheDocument();
    });
  });

  it('requires selecting a team when creating a team workspace', async () => {
    const workspace = {
      id: 'workspace-789',
      name: 'Team Lab',
      type: 'team' as const,
      teamId: 'team-1',
    };
    createWorkspaceMock.mockResolvedValue(workspace);

    fetchTeamsMock.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Alpha Team',
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'user-1',
        planId: null,
        members: [
          {
            id: 'member-1',
            role: 'admin',
            joinedAt: '2024-01-01T00:00:00Z',
            user: {
              id: 'user-1',
              email: 'user@example.com',
              name: 'User One',
              avatarUrl: null,
            },
          },
        ],
      },
    ]);

    const refetchMock = vi.fn().mockResolvedValue([workspace]);
    const setActiveWorkspaceId = vi.fn();

    renderWithProviders({ refetch: refetchMock, setActiveWorkspaceId });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New workspace' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create workspace' })).toBeEnabled());

    await user.click(screen.getByLabelText('Team workspace'));
    await waitFor(() => expect(screen.getByLabelText('Team')).toBeEnabled());

    await user.selectOptions(screen.getByLabelText('Team'), 'team-1');
    await user.type(screen.getByLabelText('Workspace name'), 'Team Lab');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => {
      expect(createWorkspaceMock).toHaveBeenCalled();
    });

    const teamCallArgs =
      createWorkspaceMock.mock.calls[createWorkspaceMock.mock.calls.length - 1] ?? [];

    expect(teamCallArgs?.[0]).toEqual({
      name: 'Team Lab',
      type: 'team',
      teamId: 'team-1',
    });

    await waitFor(() => {
      expect(refetchMock).toHaveBeenCalled();
      expect(setActiveWorkspaceId).toHaveBeenCalledWith('workspace-789');
    });
  });
});
