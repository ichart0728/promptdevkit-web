import type { ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/domains/workspaces/contexts/WorkspaceContext';

const formatWorkspaceLabel = (name: string, type: 'personal' | 'team') =>
  type === 'team' ? `${name} (Team)` : `${name} (Personal)`;

export const WorkspaceSwitcher = () => {
  const { workspaces, activeWorkspace, setActiveWorkspaceId, isLoading, isError, error, refetch, hasSession } =
    useWorkspaceContext();

  if (!hasSession) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className="h-9 min-w-[12rem] animate-pulse rounded-md bg-muted"
        role="status"
        aria-label="Loading workspaces"
        aria-live="polite"
      />
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-destructive">{error?.message ?? 'Failed to load workspaces.'}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return <div className="text-sm text-muted-foreground">No workspaces available</div>;
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setActiveWorkspaceId(event.target.value);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground" htmlFor="workspace-switcher">
      <span className="hidden sm:inline">Workspace</span>
      <select
        id="workspace-switcher"
        className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        value={activeWorkspace?.id ?? ''}
        onChange={handleChange}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id} className="text-foreground">
            {formatWorkspaceLabel(workspace.name, workspace.type)}
          </option>
        ))}
      </select>
    </label>
  );
};
