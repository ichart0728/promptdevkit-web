import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TeamMember } from '../../api/teams';

vi.mock('../../api/teams', () => ({
  teamsQueryKey: (userId: string | null) => ['teams', userId ?? 'anonymous'] as const,
  updateTeamMemberRole: vi.fn(),
  removeTeamMember: vi.fn(),
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
  it('shows editable role selection and remove button for admins managing other members', () => {
    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-2', user: { id: 'user-2', email: 'member@example.com', name: 'Member User', avatarUrl: null }, role: 'editor' })}
        currentUserId="user-1"
        currentUserRole="admin"
      />,
    );

    const roleSelect = screen.getByLabelText('Role');
    expect(roleSelect).toBeEnabled();

    const removeButton = screen.getByRole('button', { name: 'Remove member' });
    expect(removeButton).toBeInTheDocument();

    const viewerOption = within(roleSelect).getByRole('option', { name: 'Viewer' });
    expect(viewerOption).not.toBeDisabled();
  });

  it('disables downgrade options when admins view their own membership', () => {
    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-self', user: { id: 'user-1', email: 'admin@example.com', name: 'Admin', avatarUrl: null }, role: 'admin' })}
        currentUserId="user-1"
        currentUserRole="admin"
      />,
    );

    const roleSelect = screen.getByLabelText('Role');
    expect(roleSelect).toBeEnabled();

    const editorOption = within(roleSelect).getByRole('option', { name: 'Editor' });
    const viewerOption = within(roleSelect).getByRole('option', { name: 'Viewer' });

    expect(editorOption).toBeDisabled();
    expect(viewerOption).toBeDisabled();
  });

  it('hides admin-only controls for non-admin members viewing others', () => {
    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-2', user: { id: 'user-2', email: 'member@example.com', name: 'Member User', avatarUrl: null }, role: 'editor' })}
        currentUserId="user-1"
        currentUserRole="viewer"
      />,
    );

    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove member' })).not.toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  it('allows members to leave the team even without admin rights', () => {
    renderWithClient(
      <TeamMemberActions
        teamId="team-1"
        teamName="Example Team"
        member={createMember({ id: 'member-self', role: 'viewer' })}
        currentUserId="user-1"
        currentUserRole="viewer"
      />,
    );

    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    const leaveButton = screen.getByRole('button', { name: 'Leave team' });
    expect(leaveButton).toBeInTheDocument();
    expect(leaveButton).toBeEnabled();
  });
});
