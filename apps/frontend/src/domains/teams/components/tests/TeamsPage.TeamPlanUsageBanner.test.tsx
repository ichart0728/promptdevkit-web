import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Team } from '../../api/teams';
import { TeamPlanUsageBanner } from '../TeamPlanUsageBanner';

const fetchPlanLimitsMock = vi.fn();

vi.mock('@/domains/prompts/api/planLimits', () => ({
  fetchPlanLimits: (...args: Parameters<typeof fetchPlanLimitsMock>) =>
    fetchPlanLimitsMock(...args),
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const buildTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'team-1',
  name: 'Product Team',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  planId: 'pro',
  members: [
    {
      id: 'member-1',
      role: 'admin',
      joinedAt: '2024-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        name: 'Team Owner',
        avatarUrl: null,
      },
    },
    {
      id: 'member-2',
      role: 'viewer',
      joinedAt: '2024-01-02T00:00:00.000Z',
      user: {
        id: 'user-2',
        email: 'member@example.com',
        name: 'Team Member',
        avatarUrl: null,
      },
    },
    {
      id: 'member-3',
      role: 'viewer',
      joinedAt: '2024-01-03T00:00:00.000Z',
      user: {
        id: 'user-3',
        email: 'another@example.com',
        name: 'Another Member',
        avatarUrl: null,
      },
    },
  ],
  ...overrides,
});

describe('TeamsPage / TeamPlanUsageBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows available seats when the team is within the limit', async () => {
    fetchPlanLimitsMock.mockResolvedValue({
      members_per_team: {
        key: 'members_per_team',
        value_int: 10,
        value_str: null,
        value_json: null,
      },
    });

    const queryClient = createQueryClient();
    const team = buildTeam();

    render(
      <QueryClientProvider client={queryClient}>
        <TeamPlanUsageBanner team={team} planLabel="Pro" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('This team is using 3 of 10 member seats.')).toBeInTheDocument();
    expect(screen.getByTestId('team-plan-usage-banner')).toHaveAttribute('data-seat-status', 'available');
    expect(screen.queryByRole('button', { name: 'Review upgrade options' })).not.toBeInTheDocument();
  });

  it('highlights the final seat when the next invite reaches the limit', async () => {
    fetchPlanLimitsMock.mockResolvedValue({
      members_per_team: {
        key: 'members_per_team',
        value_int: 4,
        value_str: null,
        value_json: null,
      },
    });

    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeamPlanUsageBanner team={buildTeam()} planLabel="Pro" />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'Inviting one more teammate will use the remaining seat on your plan (4 total).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('team-plan-usage-banner')).toHaveAttribute('data-seat-status', 'last-seat');
    expect(await screen.findByRole('button', { name: 'Review upgrade options' })).toBeInTheDocument();
  });

  it('shows a critical warning when no seats remain', async () => {
    fetchPlanLimitsMock.mockResolvedValue({
      members_per_team: {
        key: 'members_per_team',
        value_int: 3,
        value_str: null,
        value_json: null,
      },
    });

    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeamPlanUsageBanner team={buildTeam()} planLabel="Pro" />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'This team has reached the limit of 3 members. Remove members or upgrade the plan to invite more.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('team-plan-usage-banner')).toHaveAttribute('data-seat-status', 'at-capacity');
    expect(await screen.findByRole('button', { name: 'Review upgrade options' })).toBeInTheDocument();
  });
});
