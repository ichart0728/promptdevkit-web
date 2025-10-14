import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamMember } from '../../api/teams';
import { removeTeamMember, updateTeamMemberRole } from '../../api/teams';

import { toast } from '@/components/common/toast';

vi.mock('../../api/teams', () => ({
  teamsQueryKey: (userId: string | null) => ['teams', userId ?? 'anonymous'] as const,
  updateTeamMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
}));

vi.mock('@/components/common/toast', () => ({
  toast: vi.fn(),
}));

import { TeamMemberActions } from '../TeamMemberActions';

const renderWithClient = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const createMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'member-1',
  role: 'viewer',
  joinedAt: '2024-01-01T00:00:00Z',
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
  },
  ...overrides,
});

describe('TeamMemberActions', () => {
  const mockedUpdateTeamMemberRole = vi.mocked(updateTeamMemberRole);
  const mockedRemoveTeamMember = vi.mocked(removeTeamMember);
  const mockedToast = vi.mocked(toast);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows admins to update member roles and shows a success toast', async () => {
    mockedUpdateTeamMemberRole.mockResolvedValueOnce();

    const user = userEvent.setup();

    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-2', user: { id: 'user-2', email: 'member@example.com', name: 'Member User', avatarUrl: null }, role: 'viewer' })}
        currentUserId="user-1"
        currentUserRole="admin"
      />,
    );

    const roleSelect = screen.getByLabelText('Role');
    await user.selectOptions(roleSelect, 'editor');

    await waitFor(() => {
      expect(mockedUpdateTeamMemberRole).toHaveBeenCalledWith({
        teamId: 'team-1',
        memberId: 'member-2',
        role: 'editor',
      });
    });

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith({
        title: 'Role updated',
        description: 'Editor',
      });
    });
  });

  it('confirms removal and shows toast feedback when successful', async () => {
    mockedRemoveTeamMember.mockResolvedValueOnce();

    const user = userEvent.setup();

    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({
          id: 'member-2',
          user: { id: 'user-2', email: 'member@example.com', name: 'Member User', avatarUrl: null },
          role: 'editor',
        })}
        currentUserId="user-1"
        currentUserRole="admin"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove member' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Remove member' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Remove Member User from Example Team?'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockedRemoveTeamMember).toHaveBeenCalledWith({
        teamId: 'team-1',
        memberId: 'member-2',
      });
    });

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith({
        title: 'Member removed',
        description: 'Member User no longer has access.',
      });
    });
  });

  it('allows members to initiate leaving their team with confirmation', async () => {
    mockedRemoveTeamMember.mockResolvedValueOnce();

    const user = userEvent.setup();

    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-self', role: 'viewer' })}
        currentUserId="user-1"
        currentUserRole="viewer"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Leave team' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Leave team' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Are you sure you want to leave Example Team?'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Leave team' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockedRemoveTeamMember).toHaveBeenCalledWith({
        teamId: 'team-1',
        memberId: 'member-self',
      });
    });

    await waitFor(() => {
      expect(mockedToast).toHaveBeenCalledWith({
        title: 'Left team',
        description: 'You have left Example Team.',
      });
    });
  });
});
