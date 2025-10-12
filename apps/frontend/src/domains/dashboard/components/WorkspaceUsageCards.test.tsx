import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { WorkspaceUsageCards } from './WorkspaceUsageCards';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

type WorkspaceUsage = {
  id: string;
  name: string;
  promptCount: number;
  latestUpdatedAt: string | null;
};

const fetchWorkspaceUsageMock = vi.fn<[string | null], Promise<WorkspaceUsage[]>>();

vi.mock('../api/metrics', () => ({
  workspaceUsageQueryOptions: (userId: string | null) => ({
    queryKey: ['workspace-usage', userId] as const,
    queryFn: () => fetchWorkspaceUsageMock(userId),
    staleTime: 60 * 1000,
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
      <WorkspaceUsageCards />
    </QueryClientProvider>,
  );
};

describe('WorkspaceUsageCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
  });

  it('renders skeleton cards while the usage data is loading', () => {
    fetchWorkspaceUsageMock.mockReturnValue(new Promise(() => {}));

    renderComponent();

    const skeletons = screen.getAllByTestId('workspace-usage-card-skeleton');

    expect(skeletons).toHaveLength(2);
  });

  it('renders workspace cards with usage details', async () => {
    fetchWorkspaceUsageMock.mockResolvedValueOnce([
      {
        id: 'workspace-1',
        name: 'Acme Studio',
        promptCount: 3,
        latestUpdatedAt: '2024-02-01T12:00:00Z',
      },
      {
        id: 'workspace-2',
        name: 'Beta Lab',
        promptCount: 0,
        latestUpdatedAt: null,
      },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspaceUsageMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('Acme Studio')).toBeInTheDocument();
    expect(screen.getByText('3 prompts')).toBeInTheDocument();
    expect(screen.getByText('Beta Lab')).toBeInTheDocument();
    expect(screen.getByText('0 prompts')).toBeInTheDocument();
    expect(screen.getAllByText(/Last updated|No updates yet/)).toHaveLength(2);
  });

  it('renders an empty state message when no usage is returned', async () => {
    fetchWorkspaceUsageMock.mockResolvedValueOnce([]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspaceUsageMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText('No prompts yet. Create your first prompt to see usage here.'),
    ).toBeInTheDocument();
  });

  it('prompts the viewer to sign in when no session is available', () => {
    useSessionQueryMock.mockReturnValue({
      data: null,
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);

    renderComponent();

    expect(
      screen.getByText('Sign in to view prompt activity across your workspaces.'),
    ).toBeInTheDocument();
  });
});
