import * as React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { TeamMember, TeamMemberRole } from '../../api/teams';
import { TeamMemberListControls } from '../TeamMemberListControls';
import {
  filterTeamMembers,
  type TeamMemberRoleFilter,
} from '../team-member-filters';

const MEMBERS: TeamMember[] = [
  {
    id: 'member-1',
    role: 'admin',
    joinedAt: '2024-01-01T00:00:00.000Z',
    user: {
      id: 'user-1',
      name: 'Alice Admin',
      email: 'alice@example.com',
      avatarUrl: null,
    },
  },
  {
    id: 'member-2',
    role: 'editor',
    joinedAt: '2024-01-02T00:00:00.000Z',
    user: {
      id: 'user-2',
      name: 'Bob Editor',
      email: 'bob@example.com',
      avatarUrl: null,
    },
  },
  {
    id: 'member-3',
    role: 'viewer',
    joinedAt: '2024-01-03T00:00:00.000Z',
    user: {
      id: 'user-3',
      name: 'Charlie Viewer',
      email: 'charlie@example.com',
      avatarUrl: null,
    },
  },
];

const AVAILABLE_ROLES: TeamMemberRole[] = ['admin', 'editor', 'viewer'];

const Harness: React.FC = () => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedRole, setSelectedRole] = React.useState<TeamMemberRoleFilter>('all');

  const filteredMembers = React.useMemo(
    () => filterTeamMembers(MEMBERS, searchQuery, selectedRole),
    [searchQuery, selectedRole],
  );

  return (
    <div>
      <TeamMemberListControls
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedRole={selectedRole}
        onSelectedRoleChange={setSelectedRole}
        availableRoles={AVAILABLE_ROLES}
      />
      <ul>
        {filteredMembers.map((member) => (
          <li key={member.id}>{member.user?.name}</li>
        ))}
      </ul>
      {filteredMembers.length === 0 ? <p>No members</p> : null}
    </div>
  );
};

describe('TeamMemberListControls', () => {
  it('filters members by search query across names and emails', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const searchInput = screen.getByLabelText('Search members');
    expect(searchInput).toBeInTheDocument();

    await user.type(searchInput, 'bob');

    expect(screen.getByText('Bob Editor')).toBeInTheDocument();
    expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Viewer')).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'example.com');

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('Bob Editor')).toBeInTheDocument();
    expect(screen.getByText('Charlie Viewer')).toBeInTheDocument();
  });

  it('filters members by selected role', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const roleSelect = screen.getByLabelText('Filter by role');
    await user.selectOptions(roleSelect, 'editor');

    expect(screen.getByText('Bob Editor')).toBeInTheDocument();
    expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Viewer')).not.toBeInTheDocument();

    await user.selectOptions(roleSelect, 'all');

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('Bob Editor')).toBeInTheDocument();
    expect(screen.getByText('Charlie Viewer')).toBeInTheDocument();
  });
});
