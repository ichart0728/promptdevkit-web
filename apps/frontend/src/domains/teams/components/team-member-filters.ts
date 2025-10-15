import type { TeamMember, TeamMemberRole } from '../api/teams';

export type TeamMemberRoleFilter = 'all' | TeamMemberRole;

export const filterTeamMembers = (
  members: TeamMember[],
  searchQuery: string,
  selectedRole: TeamMemberRoleFilter,
): TeamMember[] => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return members.filter((member) => {
    const matchesRole = selectedRole === 'all' || member.role === selectedRole;

    if (!matchesRole) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    const memberName = member.user?.name?.toLowerCase() ?? '';
    const memberEmail = member.user?.email?.toLowerCase() ?? '';

    return (
      memberName.includes(normalizedQuery) || memberEmail.includes(normalizedQuery)
    );
  });
};
