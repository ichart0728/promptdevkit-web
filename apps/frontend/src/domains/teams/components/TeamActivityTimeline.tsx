import * as React from 'react';

import type {
  TeamMemberRole,
  TeamMembershipEvent,
} from '../api/teams';

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatPerson = (
  person: TeamMembershipEvent['actor'],
  fallback: string,
): string => {
  if (!person) {
    return fallback;
  }

  if (person.name && person.name.trim().length > 0) {
    return person.name;
  }

  if (person.email && person.email.trim().length > 0) {
    return person.email;
  }

  return fallback;
};

const formatRole = (role: TeamMemberRole | null) => {
  if (!role) {
    return 'member';
  }

  return ROLE_LABELS[role] ?? role;
};

const formatEventDescription = (event: TeamMembershipEvent): string => {
  const actorLabel = formatPerson(event.actor, 'Someone');
  const targetLabel = formatPerson(event.target, 'a team member');
  const newRoleLabel = formatRole(event.newRole);

  switch (event.eventType) {
    case 'member_added':
      return `${actorLabel} added ${targetLabel} as ${newRoleLabel}`;
    case 'member_role_updated': {
      const previousRoleLabel = formatRole(event.previousRole);

      if (!event.previousRole) {
        return `${actorLabel} assigned ${newRoleLabel} permissions to ${targetLabel}`;
      }

      return `${actorLabel} changed ${targetLabel}'s role from ${previousRoleLabel} to ${newRoleLabel}`;
    }
    case 'member_removed':
      return `${actorLabel} removed ${targetLabel} from the team`;
    case 'member_left':
      return `${targetLabel} left the team`;
    default:
      return `${actorLabel} updated ${targetLabel}`;
  }
};

const formatTimestamp = (isoDate: string) => {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return TIMESTAMP_FORMATTER.format(date);
};

type TeamActivityTimelineProps = {
  events: TeamMembershipEvent[];
};

export const TeamActivityTimeline: React.FC<TeamActivityTimelineProps> = ({ events }) => {
  if (events.length === 0) {
    return null;
  }

  return (
    <ol className="relative space-y-6 border-l border-muted-foreground/20 pl-6" data-testid="team-activity-timeline">
      {events.map((event) => (
        <li key={event.id} className="relative pl-4">
          <span
            aria-hidden="true"
            className="absolute -left-[11px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium leading-snug">{formatEventDescription(event)}</p>
            <p className="text-xs text-muted-foreground">{formatTimestamp(event.occurredAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
};

TeamActivityTimeline.displayName = 'TeamActivityTimeline';

export { formatEventDescription as __test_only_formatEventDescription };
