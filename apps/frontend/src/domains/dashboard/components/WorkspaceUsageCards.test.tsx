import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import { WorkspaceUsageCards } from './WorkspaceUsageCards';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import type { WorkspaceUsage } from '../api/metrics';
import type { PlanLimitMap } from '@/lib/limits';

const fetchWorkspaceUsageMock = vi.hoisted(() =>
  vi.fn<[string | null], Promise<WorkspaceUsage[]>>(),
);
const fetchPlanLimitsMock = vi.hoisted(() =>
  vi.fn<[{ planId: string }], Promise<PlanLimitMap>>(),
);

vi.mock('../api/metrics', () => ({
  workspaceUsageQueryOptions: (userId: string | null) => ({
    queryKey: ['workspace-usage', userId] as const,
    queryFn: () => fetchWorkspaceUsageMock(userId),
    staleTime: 60 * 1000,
  }),
}));

vi.mock('@/domains/prompts/api/planLimits', () => ({
  fetchPlanLimits: fetchPlanLimitsMock,
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
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
    fetchPlanLimitsMock.mockImplementation(async () => ({
      prompts_per_personal_ws: {
        key: 'prompts_per_personal_ws',
        value_int: 10,
        value_str: null,
        value_json: null,
      },
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: 20,
        value_str: null,
        value_json: null,
      },
    }));
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
        workspaceType: 'personal',
        planId: 'basic',
        planLimitKey: 'prompts_per_personal_ws',
      },
      {
        id: 'workspace-2',
        name: 'Beta Lab',
        promptCount: 0,
        latestUpdatedAt: null,
        workspaceType: 'team',
        planId: 'growth',
        planLimitKey: 'prompts_per_team_ws',
      },
    ]);

    fetchPlanLimitsMock.mockImplementation(async ({ planId }) => {
      if (planId === 'basic') {
        return {
          prompts_per_personal_ws: {
            key: 'prompts_per_personal_ws',
            value_int: 5,
            value_str: null,
            value_json: null,
          },
        } as PlanLimitMap;
      }

      if (planId === 'growth') {
        return {
          prompts_per_team_ws: {
            key: 'prompts_per_team_ws',
            value_int: 15,
            value_str: null,
            value_json: null,
          },
        } as PlanLimitMap;
      }

      return {} as PlanLimitMap;
    });

    renderComponent();

    await waitFor(() => {
      expect(fetchWorkspaceUsageMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('Acme Studio')).toBeInTheDocument();
    expect(screen.getByText('3 prompts')).toBeInTheDocument();
    expect(screen.getByText('Beta Lab')).toBeInTheDocument();
    expect(screen.getByText('0 prompts')).toBeInTheDocument();
    expect(screen.getAllByText(/Last updated|No updates yet/)).toHaveLength(2);
    expect(screen.getByTestId('workspace-plan-progress-workspace-1')).toBeInTheDocument();
    expect(screen.getByText('3 / 5 prompts')).toBeInTheDocument();
    expect(screen.getByText('2 prompts remaining')).toBeInTheDocument();
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

  it('shows a loading message while plan limits are being fetched', async () => {
    fetchWorkspaceUsageMock.mockResolvedValueOnce([
      {
        id: 'workspace-3',
        name: 'Gamma Lab',
        promptCount: 4,
        latestUpdatedAt: null,
        workspaceType: 'personal',
        planId: 'basic',
        planLimitKey: 'prompts_per_personal_ws',
      },
    ]);

    fetchPlanLimitsMock.mockReturnValueOnce(new Promise(() => {}));

    renderComponent();

    expect(await screen.findByText('Gamma Lab')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-plan-loading-workspace-3')).toBeInTheDocument();
  });

  it('falls back to unlimited messaging when the plan has no cap', async () => {
    fetchWorkspaceUsageMock.mockResolvedValueOnce([
      {
        id: 'workspace-4',
        name: 'Delta Hub',
        promptCount: 8,
        latestUpdatedAt: null,
        workspaceType: 'team',
        planId: 'premium',
        planLimitKey: 'prompts_per_team_ws',
      },
    ]);

    fetchPlanLimitsMock.mockResolvedValueOnce({
      prompts_per_team_ws: {
        key: 'prompts_per_team_ws',
        value_int: null,
        value_str: null,
        value_json: null,
      },
    } as PlanLimitMap);

    renderComponent();

    expect(await screen.findByText('Delta Hub')).toBeInTheDocument();
    expect(await screen.findByText('Unlimited prompts available.')).toBeInTheDocument();
  });

  it('shows an error message when fetching plan limits fails', async () => {
    fetchWorkspaceUsageMock.mockResolvedValueOnce([
      {
        id: 'workspace-5',
        name: 'Epsilon Studio',
        promptCount: 2,
        latestUpdatedAt: null,
        workspaceType: 'personal',
        planId: 'basic',
        planLimitKey: 'prompts_per_personal_ws',
      },
    ]);

    fetchPlanLimitsMock.mockRejectedValueOnce(new Error('Network down'));

    renderComponent();

    expect(await screen.findByText('Epsilon Studio')).toBeInTheDocument();
    expect(
      await screen.findByText('Failed to load plan limits. Network down'),
    ).toBeInTheDocument();
  });
});
