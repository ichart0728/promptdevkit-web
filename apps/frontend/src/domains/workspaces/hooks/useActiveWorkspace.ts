import { useWorkspaceContext } from '../contexts/WorkspaceContext';

export const useActiveWorkspace = () => {
  const { activeWorkspace } = useWorkspaceContext();

  return activeWorkspace;
};
