import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Workspace } from '@/domains/workspaces/api/workspaces';

import { WorkspaceQuickSwitcher } from '../WorkspaceQuickSwitcher';

const workspaces: Workspace[] = [
  { id: 'workspace-1', name: 'Personal Space', type: 'personal', teamId: null, archivedAt: null },
  { id: 'workspace-2', name: 'Team Space', type: 'team', teamId: 'team-1', archivedAt: null },
];

class ResizeObserverMock {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('WorkspaceQuickSwitcher', () => {
  it('opens the palette when the quick switch button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /quick switch/i }));

    expect(screen.getByRole('dialog', { name: 'Workspace quick switcher' })).toBeInTheDocument();
  });

  it('opens the palette when the keyboard shortcut is pressed', () => {
    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={vi.fn()} />);

    expect(screen.queryByRole('dialog', { name: 'Workspace quick switcher' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog', { name: 'Workspace quick switcher' })).toBeInTheDocument();
  });

  it('opens the palette when the command key shortcut is pressed on macOS', () => {
    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={vi.fn()} />);

    expect(screen.queryByRole('dialog', { name: 'Workspace quick switcher' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByRole('dialog', { name: 'Workspace quick switcher' })).toBeInTheDocument();
  });

  it('does not open the palette when typing in an input element', () => {
    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={vi.fn()} />);

    const input = document.createElement('input');
    document.body.append(input);

    fireEvent.keyDown(input, { key: 'k', ctrlKey: true });

    expect(screen.queryByRole('dialog', { name: 'Workspace quick switcher' })).not.toBeInTheDocument();

    input.remove();
  });

  it('calls onSelect and closes when choosing a workspace', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /quick switch/i }));
    await user.click(screen.getByText('Team Space (Team)'));

    expect(onSelect).toHaveBeenCalledWith('workspace-2');
    expect(screen.queryByRole('dialog', { name: 'Workspace quick switcher' })).not.toBeInTheDocument();
  });

  it('exposes its keyboard shortcut via aria-keyshortcuts', () => {
    render(<WorkspaceQuickSwitcher workspaces={workspaces} activeWorkspaceId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /quick switch/i })).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  });
});
