import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { WorkspacePromptActivity } from '../WorkspacePromptActivity';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import type { WorkspacePromptActivity as WorkspacePromptActivityRow } from '../../api/promptActivity';

const fetchWorkspacePromptActivityMock = vi.hoisted(() =>
  vi.fn<[string | null], Promise<WorkspacePromptActivityRow[]>>(),
);

vi.mock('../../api/promptActivity', () => ({
  workspacePromptActivityQueryOptions: (userId: string | null) => ({
    queryKey: ['workspace-prompt-activity', userId] as const,
    queryFn: () => fetchWorkspacePromptActivityMock(userId),
    staleTime: 5 * 60 * 1000,
  }),
}));

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

const renderComponent = () => {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePromptActivity />
    </QueryClientProvider>,
  );
};

describe('WorkspacePromptActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
  });

  it('renders a skeleton while the activity data is loading', () => {
    fetchWorkspacePromptActivityMock.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders chart and table rows when data is available', async () => {
    fetchWorkspacePromptActivityMock.mockResolvedValueOnce([
      {
        workspaceId: 'workspace-1',
        workspaceName: 'Personal Lab',
        activityDate: '2024-03-01',
        promptUpdateCount: 2,
      },
      {
        workspaceId: 'workspace-2',
        workspaceName: 'Team Hub',
        activityDate: '2024-03-02',
        promptUpdateCount: 4,
      },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspacePromptActivityMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('Workspace prompt activity')).toBeInTheDocument();
    expect(screen.getByText('Total updates per day')).toBeInTheDocument();
    expect(screen.getByText('Personal Lab')).toBeInTheDocument();
    expect(screen.getByText('Team Hub')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();
  });

  it('renders an empty state when no activity is returned', async () => {
    fetchWorkspacePromptActivityMock.mockResolvedValueOnce([]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspacePromptActivityMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText('No prompt updates recorded yet. Start iterating on prompts to see daily activity.'),
    ).toBeInTheDocument();
  });

  it('prompts users to sign in when there is no active session', () => {
    useSessionQueryMock.mockReturnValue({
      data: null,
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);

    renderComponent();

    expect(
      screen.getByText('Sign in to review prompt updates across your workspaces.'),
    ).toBeInTheDocument();
  });

  it('shows an error message when the query fails', async () => {
    const queryError = new Error('Network down');
    fetchWorkspacePromptActivityMock.mockRejectedValueOnce(queryError);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspacePromptActivityMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText('Failed to load daily prompt activity. Network down'),
    ).toBeInTheDocument();
  });
});
