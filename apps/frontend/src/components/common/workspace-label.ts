export const formatWorkspaceLabel = (name: string, type: 'personal' | 'team') =>
  type === 'team' ? `${name} (Team)` : `${name} (Personal)`;
