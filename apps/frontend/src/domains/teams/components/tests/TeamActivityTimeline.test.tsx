import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeamMembershipEvent } from '../../api/teams';
import { TeamActivityTimeline, __test_only_formatEventDescription } from '../TeamActivityTimeline';

const createEvent = (overrides: Partial<TeamMembershipEvent>): TeamMembershipEvent => ({
  id: 'event-1',
  teamId: 'team-1',
  eventType: 'member_added',
  occurredAt: '2024-02-01T08:30:00.000Z',
  actor: {
    id: 'user-1',
    email: 'owner@example.com',
    name: 'Team Owner',
    avatarUrl: null,
  },
  target: {
    id: 'user-2',
    email: 'member@example.com',
    name: 'Team Member',
    avatarUrl: null,
  },
  previousRole: null,
  newRole: 'viewer',
  ...overrides,
});

describe('TeamActivityTimeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a timeline entry for each event', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      format: () => 'Feb 1, 2024, 08:30 AM',
    }) as unknown as Intl.DateTimeFormat);

    const events: TeamMembershipEvent[] = [
      createEvent({ id: 'event-1', eventType: 'member_added', newRole: 'viewer' }),
      createEvent({ id: 'event-2', eventType: 'member_role_updated', previousRole: 'viewer', newRole: 'editor' }),
    ];

    render(<TeamActivityTimeline events={events} />);

    expect(screen.getByTestId('team-activity-timeline')).toBeInTheDocument();
    expect(screen.getByText('Team Owner added Team Member as Viewer')).toBeInTheDocument();
    expect(
      screen.getByText("Team Owner changed Team Member's role from Viewer to Editor"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Feb 1, 2024/)).toHaveLength(events.length);
  });

  it('returns null when there are no events', () => {
    const { container } = render(<TeamActivityTimeline events={[]} />);

    expect(container.firstChild).toBeNull();
  });
});

describe('formatEventDescription', () => {
  it('describes role assignment when no previous role exists', () => {
    const event = createEvent({
      eventType: 'member_role_updated',
      previousRole: null,
      newRole: 'admin',
    });

    expect(__test_only_formatEventDescription(event)).toBe(
      'Team Owner assigned Admin permissions to Team Member',
    );
  });

  it('describes when a member leaves a team', () => {
    const event = createEvent({
      eventType: 'member_left',
      actor: {
        id: 'user-2',
        email: 'member@example.com',
        name: 'Team Member',
        avatarUrl: null,
      },
      target: {
        id: 'user-2',
        email: 'member@example.com',
        name: 'Team Member',
        avatarUrl: null,
      },
      previousRole: 'viewer',
      newRole: null,
    });

    expect(__test_only_formatEventDescription(event)).toBe('Team Member left the team');
  });

  it('falls back to generic messaging for removals', () => {
    const event = createEvent({
      eventType: 'member_removed',
      target: null,
      previousRole: 'viewer',
      newRole: null,
    });

    expect(__test_only_formatEventDescription(event)).toBe(
      'Team Owner removed a team member from the team',
    );
  });
});
