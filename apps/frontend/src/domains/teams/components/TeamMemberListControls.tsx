import * as React from 'react';

import { Input } from '@/components/ui/input';

import type { TeamMemberRole } from '../api/teams';
import type { TeamMemberRoleFilter } from './team-member-filters';

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

type TeamMemberListControlsProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedRole: TeamMemberRoleFilter;
  onSelectedRoleChange: (value: TeamMemberRoleFilter) => void;
  availableRoles: TeamMemberRole[];
};

export const TeamMemberListControls: React.FC<TeamMemberListControlsProps> = ({
  searchQuery,
  onSearchQueryChange,
  selectedRole,
  onSelectedRoleChange,
  availableRoles,
}) => {
  const searchInputId = React.useId();
  const roleSelectId = React.useId();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex w-full flex-col gap-2 sm:max-w-xs">
        <label className="text-sm font-medium" htmlFor={searchInputId}>
          Search members
        </label>
        <Input
          id={searchInputId}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search by name or email"
        />
      </div>
      <div className="flex w-full flex-col gap-2 sm:max-w-xs">
        <label className="text-sm font-medium" htmlFor={roleSelectId}>
          Filter by role
        </label>
        <select
          id={roleSelectId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={selectedRole}
          onChange={(event) => onSelectedRoleChange(event.target.value as TeamMemberRoleFilter)}
        >
          <option value="all">All roles</option>
          {availableRoles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role] ?? role}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
