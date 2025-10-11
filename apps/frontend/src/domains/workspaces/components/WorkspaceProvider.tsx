import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { workspacesQueryOptions } from '../api/workspaces';
import type { Workspace } from '../api/workspaces';
import { WorkspaceContext, type WorkspaceContextValue } from '../contexts/WorkspaceContext';

const noopRefetch = async () => Promise.resolve([]);

export const WorkspaceProvider = ({ children }: { children: React.ReactNode }) => {
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;
  const hasSession = !!userId;

  const workspacesQuery = useQuery({
    ...workspacesQueryOptions(userId),
    enabled: hasSession,
  });

  const { refetch: queryRefetch } = workspacesQuery;

  const workspaces = React.useMemo(() => (hasSession ? workspacesQuery.data ?? [] : []), [
    hasSession,
    workspacesQuery.data,
  ]);
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);
  const pendingActiveWorkspaceIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!hasSession) {
      pendingActiveWorkspaceIdRef.current = null;
      setActiveWorkspaceId(null);
      return;
    }

    if (!workspaces.length) {
      pendingActiveWorkspaceIdRef.current = null;
      setActiveWorkspaceId(null);
      return;
    }

    setActiveWorkspaceId((currentId) => {
      const pendingId = pendingActiveWorkspaceIdRef.current;

      if (pendingId && workspaces.some((workspace) => workspace.id === pendingId)) {
        pendingActiveWorkspaceIdRef.current = null;
        return pendingId;
      }

      if (currentId && workspaces.some((workspace) => workspace.id === currentId)) {
        return currentId;
      }

      pendingActiveWorkspaceIdRef.current = null;
      return workspaces[0]?.id ?? null;
    });
  }, [hasSession, workspaces]);

  const handleSetActiveWorkspaceId = React.useCallback(
    (workspaceId: string) => {
      pendingActiveWorkspaceIdRef.current = workspaceId;

      setActiveWorkspaceId((currentId) => {
        if (currentId === workspaceId) {
          pendingActiveWorkspaceIdRef.current = null;
          return currentId;
        }

        const exists = workspaces.some((workspace) => workspace.id === workspaceId);

        if (exists) {
          pendingActiveWorkspaceIdRef.current = null;
          return workspaceId;
        }

        return currentId;
      });
    },
    [workspaces],
  );

  const activeWorkspace = React.useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const refetchWorkspaces = React.useCallback(async (): Promise<Workspace[]> => {
    if (!hasSession) {
      return [];
    }

    const result = await queryRefetch();

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []) as Workspace[];
  }, [hasSession, queryRefetch]);

  const contextValue = React.useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId: handleSetActiveWorkspaceId,
      isLoading: hasSession && workspacesQuery.isPending,
      isError: hasSession && workspacesQuery.status === 'error',
      error: hasSession && workspacesQuery.status === 'error' ? (workspacesQuery.error as Error) : null,
      refetch: hasSession ? refetchWorkspaces : noopRefetch,
      hasSession,
    }),
    [
      workspaces,
      activeWorkspace,
      handleSetActiveWorkspaceId,
      hasSession,
      workspacesQuery.isPending,
      workspacesQuery.status,
      workspacesQuery.error,
      refetchWorkspaces,
    ],
  );

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
};
