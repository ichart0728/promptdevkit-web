import * as React from 'react';

import type { Workspace } from '../api/workspaces';

type RefetchFn = () => Promise<Workspace[]>;

export type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (workspaceId: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: RefetchFn;
  hasSession: boolean;
};

export const WorkspaceContext = React.createContext<WorkspaceContextValue | undefined>(undefined);

export const useWorkspaceContext = () => {
  const context = React.useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider.');
  }

  return context;
};
