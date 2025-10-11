import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { teamsQueryOptions } from '@/domains/teams/api/teams';
import { workspacesQueryOptions } from '@/domains/workspaces/api/workspaces';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
};

const getPlanLabel = (planId: string | null) => {
  if (!planId) {
    return 'Unknown plan';
  }

  return PLAN_LABELS[planId] ?? planId;
};

export const TeamsPage = () => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;

  const teamsQuery = useQuery({
    ...teamsQueryOptions(userId),
    enabled: !!userId,
  });

  const workspacesQuery = useQuery({
    ...workspacesQueryOptions(userId),
    enabled: !!userId,
  });

  const isSessionLoading = sessionQuery.status === 'pending';
  const isTeamsLoading = teamsQuery.status === 'pending';
  const isWorkspacesLoading = workspacesQuery.status === 'pending';
  const workspacesError = workspacesQuery.status === 'error';

  const teamWorkspaces = React.useMemo(() => {
    const entries = new Map<string, { id: string; name: string }[]>();

    if (workspacesQuery.status !== 'success') {
      return entries;
    }

    workspacesQuery.data
      .filter((workspace) => workspace.type === 'team' && workspace.teamId)
      .forEach((workspace) => {
        const existing = entries.get(workspace.teamId!);
        const next = [
          ...(existing ?? []),
          { id: workspace.id, name: workspace.name },
        ];

        entries.set(workspace.teamId!, next);
      });

    return entries;
  }, [workspacesQuery.status, workspacesQuery.data]);

  if (isSessionLoading) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Invite collaborators and assign permissions across your organization.
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Loading teams…
        </div>
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Invite collaborators and assign permissions across your organization.
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sign in to view the teams you collaborate with.
        </div>
      </section>
    );
  }

  if (isTeamsLoading) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Invite collaborators and assign permissions across your organization.
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Loading teams…
        </div>
      </section>
    );
  }

  if (teamsQuery.status === 'error') {
    const errorMessage =
      teamsQuery.error instanceof Error ? teamsQuery.error.message : 'Please try again.';

    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Invite collaborators and assign permissions across your organization.
          </p>
        </div>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-8 text-center text-sm text-destructive">
          Failed to load teams. {errorMessage}
        </div>
      </section>
    );
  }

  const teams = teamsQuery.data ?? [];

  if (teams.length === 0) {
    return (
      <section className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Invite collaborators and assign permissions across your organization.
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          You’re not a member of any teams yet. Ask an administrator to invite you.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Teams</h1>
        <p className="text-muted-foreground">
          Review membership and shared workspaces for the teams you belong to.
        </p>
      </div>
      <div className="space-y-6">
        {teams.map((team) => {
          const planLabel = getPlanLabel(team.planId);
          const members = team.members;
          const workspaces = teamWorkspaces.get(team.id) ?? [];

          return (
            <article key={team.id} className="rounded-lg border bg-card text-card-foreground shadow-sm">
              <header className="flex flex-col gap-4 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{team.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {members.length} {members.length === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                  {planLabel}
                </span>
              </header>
              <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
                <section aria-label={`${team.name} members`} className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground">Members</h3>
                  <ul className="space-y-3">
                    {members.map((member) => (
                      <li key={member.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                        <div>
                          <p className="font-medium">{member.user?.name ?? 'Unknown member'}</p>
                          <p className="text-sm text-muted-foreground">
                            {member.user?.email ?? 'Contact information unavailable'}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                          {member.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label={`${team.name} shared workspaces`} className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground">Shared workspaces</h3>
                  {isWorkspacesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading shared workspaces…</p>
                  ) : workspacesError ? (
                    <p className="text-sm text-destructive">Failed to load shared workspaces. Please try again.</p>
                  ) : workspaces.length > 0 ? (
                    <ul className="space-y-3">
                      {workspaces.map((workspace) => (
                        <li key={workspace.id} className="rounded-md border p-3">
                          <p className="font-medium">{workspace.name}</p>
                          <p className="text-sm text-muted-foreground">Team workspace</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No shared workspaces yet.</p>
                  )}
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
