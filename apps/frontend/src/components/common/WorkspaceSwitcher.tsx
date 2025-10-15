import * as React from 'react';

import { Button } from '@/components/ui/button';
import { ManageWorkspaceDialog } from '@/domains/workspaces/components/ManageWorkspaceDialog';
import { useWorkspaceContext } from '@/domains/workspaces/contexts/WorkspaceContext';

import { formatWorkspaceLabel } from './workspace-label';
import { WorkspaceQuickSwitcher } from './WorkspaceQuickSwitcher';

export const WorkspaceSwitcher = () => {
  const { workspaces, activeWorkspace, setActiveWorkspaceId, isLoading, isError, error, refetch, hasSession } =
    useWorkspaceContext();

  const selectableWorkspaces = React.useMemo(() => {
    if (activeWorkspace && activeWorkspace.archivedAt) {
      const activeWorkspaceInList = workspaces.some((workspace) => workspace.id === activeWorkspace.id);

      if (!activeWorkspaceInList) {
        return [activeWorkspace, ...workspaces];
      }
    }

    return workspaces;
  }, [activeWorkspace, workspaces]);

  const hasSelectableWorkspaces = selectableWorkspaces.length > 0;

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

  if (!hasSelectableWorkspaces) {
    return <div className="text-sm text-muted-foreground">No workspaces available</div>;
  }

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveWorkspaceId(event.target.value);
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <label className="flex items-center gap-2" htmlFor="workspace-switcher">
        <span className="hidden sm:inline">Workspace</span>
        <select
          id="workspace-switcher"
          className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          value={activeWorkspace?.id ?? ''}
          onChange={handleChange}
        >
          {selectableWorkspaces.map((workspace) => {
            const label = formatWorkspaceLabel(workspace.name, workspace.type);
            const isArchived = Boolean(workspace.archivedAt);

            return (
              <option key={workspace.id} value={workspace.id} className="text-foreground">
                {isArchived ? `${label} (Archived)` : label}
              </option>
            );
          })}
        </select>
      </label>
      <WorkspaceQuickSwitcher
        workspaces={selectableWorkspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        onSelect={setActiveWorkspaceId}
      />
      <ManageWorkspaceDialog />
    </div>
  );
};
