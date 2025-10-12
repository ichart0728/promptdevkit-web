import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanLimitError, type IntegerPlanLimitEvaluation } from '@/lib/limits';

import { TeamInviteForm } from '../TeamInviteForm';

import { TeamInviteUserNotFoundError, type Team } from '../../api/teams';

const toastMock = vi.fn();

vi.mock('@/components/common/toast', () => ({
  toast: (...args: Parameters<typeof toastMock>) => toastMock(...args),
}));

const inviteTeamMemberMock = vi.fn();

const supabaseRpcMock = vi.fn();
const supabaseFromMock = vi.fn();

vi.mock('@/domains/teams/api/teams', async () => {
  const actual = await vi.importActual<typeof import('../../api/teams')>(
    '@/domains/teams/api/teams',
  );

  return {
    ...actual,
    inviteTeamMember: (...args: Parameters<typeof inviteTeamMemberMock>) =>
      inviteTeamMemberMock(...args),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: Parameters<typeof supabaseRpcMock>) => supabaseRpcMock(...args),
    from: (...args: Parameters<typeof supabaseFromMock>) => supabaseFromMock(...args),
  },
}));

const fetchPlanLimitsMock = vi.fn();

vi.mock('@/domains/prompts/api/planLimits', () => ({
  fetchPlanLimits: (...args: Parameters<typeof fetchPlanLimitsMock>) =>
    fetchPlanLimitsMock(...args),
  planLimitsQueryKey: (planId: string) => ['plan-limits', planId] as const,
}));

type TeamOverrides = Partial<Team>;

type BuildTeamOptions = TeamOverrides & { members?: Team['members'] };

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const defaultPlanLimits = {
  members_per_team: {
    key: 'members_per_team',
    value_int: 5,
    value_str: null,
    value_json: null,
  },
} as const;

const buildTeam = (overrides: BuildTeamOptions = {}): Team => {
  const { members = [
    {
      id: 'member-1',
      role: 'admin' as const,
      joinedAt: '2024-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        email: 'owner@example.com',
        name: 'Team Owner',
        avatarUrl: null,
      },
    },
  ], ...rest } = overrides;

  return {
    id: 'team-1',
    name: 'Product Team',
    createdAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'user-1',
    planId: 'pro',
    members,
    ...rest,
  };
};

const renderInviteForm = (teamOverrides: BuildTeamOptions = {}) => {
  const queryClient = createQueryClient();
  const team = buildTeam(teamOverrides);

  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <TeamInviteForm team={team} currentUserId="user-1" />
    </QueryClientProvider>,
  );

  return { queryClient, team, ...renderResult };
};

describe('TeamInviteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPlanLimitsMock.mockResolvedValue(defaultPlanLimits);
  });

  it('invites a member successfully and refreshes the team list', async () => {
    inviteTeamMemberMock.mockResolvedValue({
      id: 'member-2',
      role: 'viewer',
      joinedAt: '2024-01-02T00:00:00.000Z',
      user: {
        id: 'user-2',
        email: 'new.member@example.com',
        name: 'New Member',
        avatarUrl: null,
      },
    });

    const { queryClient } = renderInviteForm();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const user = userEvent.setup();
    const emailInput = await screen.findByLabelText('Email address');

    await user.type(emailInput, 'new.member@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(inviteTeamMemberMock).toHaveBeenCalledWith({
        teamId: 'team-1',
        email: 'new.member@example.com',
        role: 'viewer',
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', 'user-1'] });
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Member invited',
        description: 'Invitation sent to New Member.',
      });
      expect(emailInput).toHaveValue('');
    });
  });

  it('surfaces an upgrade prompt when the plan limit is exceeded', async () => {
    const evaluation: IntegerPlanLimitEvaluation = {
      key: 'members_per_team',
      currentUsage: 5,
      delta: 1,
      nextUsage: 6,
      limitValue: 5,
      status: 'limit-exceeded',
      allowed: false,
      shouldRecommendUpgrade: true,
    };

    inviteTeamMemberMock.mockRejectedValue(new PlanLimitError(evaluation));

    renderInviteForm();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'full.team@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    await waitFor(() => {
      expect(inviteTeamMemberMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(
        'This team has reached its member limit. Remove members or upgrade the plan to continue inviting.',
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Upgrade to unlock more capacity' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByRole('button', { name: 'Review upgrade options' }),
    ).toBeInTheDocument();

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('shows a general error message when the invitation fails', async () => {
    inviteTeamMemberMock.mockRejectedValue(new Error('Network error'));

    renderInviteForm();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'error.case@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Upgrade to unlock more capacity' })).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('shows a field error when the invitee email cannot be found', async () => {
    inviteTeamMemberMock.mockRejectedValue(
      new TeamInviteUserNotFoundError('missing.user@example.com'),
    );

    renderInviteForm();

    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText('Email address'),
      'missing.user@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Send invite' }));

    expect(
      await screen.findByText(
        'No user with that email was found. Ask them to sign up first.',
      ),
    ).toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
