import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { Workspace } from '@/domains/workspaces/api/workspaces';

import { formatWorkspaceLabel } from './workspace-label';

type WorkspaceQuickSwitcherProps = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    (tagName === 'DIV' && target.getAttribute('role') === 'textbox')
  );
};

export const WorkspaceQuickSwitcher = ({ workspaces, activeWorkspaceId, onSelect }: WorkspaceQuickSwitcherProps) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = React.useCallback(
    (workspaceId: string) => {
      onSelect(workspaceId);
      setIsOpen(false);
    },
    [onSelect],
  );

  const handleGlobalKeyDown = React.useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    const isModifierPressed = event.metaKey || event.ctrlKey;
    const isKKey = event.key.toLowerCase() === 'k';

    if (!isModifierPressed || !isKKey) {
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    event.preventDefault();

    setIsOpen((previous) => !previous);
  }, []);

  React.useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleGlobalKeyDown]);

  const handleOpenChange = React.useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="workspace-quick-switcher"
        onClick={() => setIsOpen(true)}
      >
        Quick switch
        <span className="ml-2 hidden text-xs text-muted-foreground sm:inline" aria-hidden>
          ⌘K / Ctrl+K
        </span>
        <span className="sr-only">Keyboard shortcut: Command+K on macOS or Ctrl+K on Windows</span>
      </Button>
      <CommandDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        label="Workspace quick switcher"
        description="Search for a workspace and press enter to switch"
        contentProps={{ id: 'workspace-quick-switcher' }}
      >
        <CommandInput placeholder="Search workspaces..." autoFocus />
        <CommandList>
          <CommandEmpty>No workspaces found.</CommandEmpty>
          {workspaces.length > 0 ? (
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => {
                const label = formatWorkspaceLabel(workspace.name, workspace.type);
                const isArchived = Boolean(workspace.archivedAt);
                const isActive = workspace.id === activeWorkspaceId;

                return (
                  <CommandItem
                    key={workspace.id}
                    value={`${workspace.name} ${workspace.type}`}
                    onSelect={() => handleSelect(workspace.id)}
                    aria-current={isActive}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{label}</span>
                        {isArchived ? (
                          <span className="text-xs text-muted-foreground">Archived workspace</span>
                        ) : null}
                      </div>
                      {isActive ? <span className="text-xs text-muted-foreground">Active</span> : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
};
