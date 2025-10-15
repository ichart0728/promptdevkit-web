import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { WorkspaceEngagementCards } from './WorkspaceEngagementCards';
import type { WorkspaceCommentEngagement } from '../api/commentMetrics';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

const fetchWorkspaceCommentEngagementMock = vi.hoisted(() =>
  vi.fn<[], Promise<WorkspaceCommentEngagement[]>>(),
);

vi.mock('../api/commentMetrics', () => ({
  workspaceCommentEngagementQueryOptions: (userId: string | null) => ({
    queryKey: ['workspace-comment-engagement', userId] as const,
    queryFn: () => fetchWorkspaceCommentEngagementMock(),
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
      <WorkspaceEngagementCards />
    </QueryClientProvider>,
  );
};

describe('WorkspaceEngagementCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'success',
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
  });

  it('renders skeleton cards while the engagement data is loading', () => {
    fetchWorkspaceCommentEngagementMock.mockReturnValue(new Promise(() => {}));

    renderComponent();

    const skeletons = screen.getAllByTestId('workspace-engagement-card-skeleton');

    expect(skeletons).toHaveLength(2);
  });

  it('renders workspace cards with comment engagement details', async () => {
    fetchWorkspaceCommentEngagementMock.mockResolvedValueOnce([
      {
        id: 'workspace-1',
        name: 'Acme Studio',
        commentCount: 5,
        latestCommentAt: '2024-03-01T10:00:00Z',
      },
      {
        id: 'workspace-2',
        name: 'Beta Lab',
        commentCount: 0,
        latestCommentAt: null,
      },
    ]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspaceCommentEngagementMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('Acme Studio')).toBeInTheDocument();
    expect(screen.getByText('5 comments')).toBeInTheDocument();
    expect(screen.getByText('Beta Lab')).toBeInTheDocument();
    expect(screen.getByText('0 comments')).toBeInTheDocument();
    expect(screen.getAllByText(/Last comment|No comments yet/)).toHaveLength(2);
  });

  it('renders an empty state when no engagement data is available', async () => {
    fetchWorkspaceCommentEngagementMock.mockResolvedValueOnce([]);

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspaceCommentEngagementMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText('No comments yet. Encourage your team to start the conversation.'),
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
      screen.getByText('Sign in to view comment activity across your workspaces.'),
    ).toBeInTheDocument();
  });

  it('shows an error message when fetching engagement data fails', async () => {
    fetchWorkspaceCommentEngagementMock.mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    expect(
      await screen.findByText('Failed to load workspace comment engagement. Network error'),
    ).toBeInTheDocument();
  });
});
