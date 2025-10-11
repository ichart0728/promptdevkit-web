import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceContext } from '@/domains/workspaces/contexts/WorkspaceContext';

type ContextValue = ComponentProps<typeof WorkspaceContext.Provider>['value'];

const baseContext: ContextValue = {
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  hasSession: true,
};

const renderSwitcher = (value: ContextValue) =>
  render(
    <WorkspaceContext.Provider value={value}>
      <WorkspaceSwitcher />
    </WorkspaceContext.Provider>,
  );

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the user is signed out', () => {
    const { container } = renderSwitcher({ ...baseContext, hasSession: false });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a loading placeholder while workspaces load', () => {
    renderSwitcher({ ...baseContext, isLoading: true });

    expect(screen.getByRole('status', { name: 'Loading workspaces' })).toBeInTheDocument();
  });

  it('renders an empty state message when no workspaces exist', () => {
    renderSwitcher(baseContext);

    expect(screen.getByText('No workspaces available')).toBeInTheDocument();
  });

  it('allows selecting a workspace', async () => {
    const setActiveWorkspaceId = vi.fn();
    const user = userEvent.setup();
    const value: ContextValue = {
      ...baseContext,
      workspaces: [
        { id: 'workspace-1', name: 'Personal Space', type: 'personal', teamId: null },
        { id: 'workspace-2', name: 'Team Space', type: 'team', teamId: 'team-1' },
      ],
      activeWorkspace: { id: 'workspace-1', name: 'Personal Space', type: 'personal', teamId: null },
      setActiveWorkspaceId,
    };

    renderSwitcher(value);

    await user.selectOptions(screen.getByRole('combobox'), 'workspace-2');

    expect(setActiveWorkspaceId).toHaveBeenCalledWith('workspace-2');
  });
});
