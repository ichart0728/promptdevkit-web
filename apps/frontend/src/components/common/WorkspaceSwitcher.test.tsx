import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { WorkspaceContext } from '@/domains/workspaces/contexts/WorkspaceContext';

const manageDialogMock = vi.fn(() => <div data-testid="manage-workspace-dialog" />);

vi.mock('@/domains/workspaces/components/ManageWorkspaceDialog', () => ({
  ManageWorkspaceDialog: () => manageDialogMock(),
}));

vi.mock('./WorkspaceQuickSwitcher', () => ({
  WorkspaceQuickSwitcher: () => <div data-testid="workspace-quick-switcher" />,
}));

type ContextValue = ComponentProps<typeof WorkspaceContext.Provider>['value'];

const baseContext: ContextValue = {
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspaceId: vi.fn(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn().mockResolvedValue([]),
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
        { id: 'workspace-1', name: 'Personal Space', type: 'personal', teamId: null, archivedAt: null },
        { id: 'workspace-2', name: 'Team Space', type: 'team', teamId: 'team-1', archivedAt: null },
      ],
      activeWorkspace: {
        id: 'workspace-1',
        name: 'Personal Space',
        type: 'personal',
        teamId: null,
        archivedAt: null,
      },
      setActiveWorkspaceId,
    };

    renderSwitcher(value);

    await user.selectOptions(screen.getByRole('combobox'), 'workspace-2');

    expect(setActiveWorkspaceId).toHaveBeenCalledWith('workspace-2');
    expect(manageDialogMock).toHaveBeenCalled();
    expect(screen.getByTestId('workspace-quick-switcher')).toBeInTheDocument();
  });

  it('shows the active archived workspace so it can be restored', () => {
    const value: ContextValue = {
      ...baseContext,
      workspaces: [],
      activeWorkspace: {
        id: 'workspace-1',
        name: 'Personal Space',
        type: 'personal',
        teamId: null,
        archivedAt: '2024-01-01T00:00:00Z',
      },
    };

    renderSwitcher(value);

    expect(screen.getByRole('combobox')).toHaveValue('workspace-1');
    expect(
      screen.getByRole('option', {
        name: 'Personal Space (Personal) (Archived)',
      }),
    ).toBeInTheDocument();
    expect(manageDialogMock).toHaveBeenCalled();
  });
});
