import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import type { Team } from '@/domains/teams/api/teams';
import type { Workspace } from '@/domains/workspaces/api/workspaces';
import { TeamsPage } from './teams';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

const fetchPlanLimitsMock = vi.fn(async () => ({
  members_per_team: {
    key: 'members_per_team',
    value_int: 5,
    value_str: null,
    value_json: null,
  },
}));

const fetchTeamsMock = vi.fn(async () => [] as Team[]);
const fetchWorkspacesMock = vi.fn(async () => [] as Workspace[]);

vi.mock('@/domains/teams/api/teams', () => ({
  teamsQueryOptions: (userId: string | null) => ({
    queryKey: ['teams', userId ?? 'anonymous'] as const,
    queryFn: () => fetchTeamsMock(),
  }),
  teamsQueryKey: (userId: string | null) => ['teams', userId ?? 'anonymous'] as const,
  fetchTeams: () => fetchTeamsMock(),
  updateTeamMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
}));

vi.mock('@/domains/workspaces/api/workspaces', () => ({
  workspacesQueryOptions: (userId: string | null) => ({
    queryKey: ['workspaces', userId ?? 'anonymous'] as const,
    queryFn: () => fetchWorkspacesMock(),
  }),
  fetchWorkspaces: () => fetchWorkspacesMock(),
}));

vi.mock('@/domains/prompts/api/planLimits', () => ({
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
  fetchPlanLimits: (...args: Parameters<typeof fetchPlanLimitsMock>) => fetchPlanLimitsMock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/domains/auth/hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const buildSessionQueryValue = (overrides: Partial<ReturnType<typeof useSessionQuery>> = {}) =>
  ({
    data: { user: { id: 'user-123', email: 'demo@example.com' } },
    status: 'success',
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSessionQuery>);

const renderTeamsPage = () => {
  const queryClient = createTestQueryClient();

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <TeamsPage />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
};

describe('TeamsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
    fetchWorkspacesMock.mockResolvedValue([]);
    fetchPlanLimitsMock.mockResolvedValue({
      members_per_team: {
        key: 'members_per_team',
        value_int: 5,
        value_str: null,
        value_json: null,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a loading state while teams are fetching', () => {
    fetchTeamsMock.mockReturnValue(new Promise<Team[]>(() => {}));

    renderTeamsPage();

    expect(screen.getByText('Loading teams…')).toBeInTheDocument();
  });

  it('renders the empty state when no teams exist', async () => {
    fetchTeamsMock.mockResolvedValue([]);

    renderTeamsPage();

    await waitFor(() => {
      expect(
        screen.getByText('You’re not a member of any teams yet. Ask an administrator to invite you.'),
      ).toBeInTheDocument();
    });
  });

  it('renders an error state when the query fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchTeamsMock.mockRejectedValueOnce(new Error('Network error'));

    renderTeamsPage();

    await screen.findByText('Failed to load teams. Network error');

    consoleErrorSpy.mockRestore();
  });

  it('renders team membership and workspaces', async () => {
    const team: Team = {
      id: 'team-1',
      name: 'Prompt Builders',
      createdAt: '2024-01-05T09:00:00Z',
      createdBy: 'user-123',
      planId: 'pro',
      members: [
        {
          id: 'member-1',
          role: 'admin',
          joinedAt: '2024-01-05T09:05:00Z',
          user: {
            id: 'user-123',
            name: 'Team Owner',
            email: 'team.owner@example.com',
            avatarUrl: null,
          },
        },
        {
          id: 'member-2',
          role: 'editor',
          joinedAt: '2024-01-05T09:06:00Z',
          user: {
            id: 'user-456',
            name: 'Team Editor',
            email: 'team.editor@example.com',
            avatarUrl: null,
          },
        },
      ],
    };

    fetchTeamsMock.mockResolvedValue([team]);
    fetchWorkspacesMock.mockResolvedValue([
      {
        id: 'workspace-1',
        name: 'Prompt Builders HQ',
        type: 'team',
        teamId: 'team-1',
        archivedAt: null,
      },
    ]);

    const { asFragment } = renderTeamsPage();

    await waitFor(() => {
      expect(screen.getByText('Prompt Builders')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('This team is using 2 of 5 member seats.')).toBeInTheDocument();
    });

    expect(asFragment()).toMatchSnapshot();
  });
});
