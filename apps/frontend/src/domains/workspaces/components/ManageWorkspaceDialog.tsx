import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

import {
  manageWorkspace,
  type ManageWorkspaceAction,
  type ManageWorkspaceParams,
  workspacesQueryKey,
} from '../api/workspaces';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { manageWorkspaceSchema, type ManageWorkspaceFormValues } from '../forms/manageWorkspaceSchema';

const DEFAULT_FORM_VALUES: ManageWorkspaceFormValues = {
  name: '',
};

type ManageWorkspaceDialogProps = {
  trigger?: React.ReactNode;
};

export const ManageWorkspaceDialog = ({ trigger }: ManageWorkspaceDialogProps) => {
  const { activeWorkspace, refetch, hasSession } = useWorkspaceContext();
  const sessionQuery = useSessionQuery();
  const userId = sessionQuery.data?.user?.id ?? null;
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<ManageWorkspaceAction | null>(null);

  const form = useForm<ManageWorkspaceFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    resolver: zodResolver(manageWorkspaceSchema),
  });

  const manageWorkspaceMutation = useMutation({
    mutationFn: manageWorkspace,
  });

  const isArchived = Boolean(activeWorkspace?.archivedAt);
  const watchedName = form.watch('name');
  const trimmedWatchedName = watchedName?.trim() ?? '';
  const isNameUnchanged = activeWorkspace ? trimmedWatchedName === activeWorkspace.name : true;
  const isMutating = manageWorkspaceMutation.status === 'pending';

  const resetForm = React.useCallback(
    (nextName: string) => {
      form.reset({ name: nextName });
      form.clearErrors();
    },
    [form],
  );

  React.useEffect(() => {
    if (!open) {
      resetForm(activeWorkspace?.name ?? '');
    }
  }, [activeWorkspace, open, resetForm]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);

      if (nextOpen) {
        resetForm(activeWorkspace?.name ?? '');
      } else {
        setPendingAction(null);
      }
    },
    [activeWorkspace, resetForm],
  );

  const invalidateWorkspaceQueries = React.useCallback(async () => {
    if (!userId) {
      return;
    }

    await queryClient.invalidateQueries({ queryKey: workspacesQueryKey(userId) });
  }, [queryClient, userId]);

  const performAction = React.useCallback(
    async (params: ManageWorkspaceParams, messages: { title: string; description?: string }) => {
      if (!activeWorkspace) {
        form.setError('root', {
          type: 'manual',
          message: 'Select a workspace to manage.',
        });
        return;
      }

      if (!userId) {
        form.setError('root', {
          type: 'manual',
          message: 'You must be signed in to manage a workspace.',
        });
        return;
      }

      setPendingAction(params.action);
      form.clearErrors('root');

      try {
        const result = await manageWorkspaceMutation.mutateAsync(params);

        await invalidateWorkspaceQueries();

        try {
          await refetch();
        } catch (refreshError) {
          const message =
            refreshError instanceof Error
              ? refreshError.message
              : 'Workspace updated, but failed to refresh the workspace list. Please reload the page.';

          form.setError('root', { type: 'manual', message });
          return;
        }

        resetForm(result.name);
        toast(messages);
        handleOpenChange(false);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update the workspace. Please try again.';
        form.setError('root', { type: 'manual', message });
      } finally {
        setPendingAction(null);
      }
    },
    [activeWorkspace, form, handleOpenChange, invalidateWorkspaceQueries, manageWorkspaceMutation, refetch, resetForm, userId],
  );

  const handleRename = form.handleSubmit(async (values) => {
    if (!activeWorkspace) {
      form.setError('root', { type: 'manual', message: 'Select a workspace to rename.' });
      return;
    }

    const trimmedName = values.name.trim();

    await performAction(
      { workspaceId: activeWorkspace.id, action: 'rename', name: trimmedName },
      {
        title: 'Workspace renamed',
        description: `Workspace name updated to “${trimmedName}”.`,
      },
    );
  });

  const handleArchive = async () => {
    if (!activeWorkspace) {
      form.setError('root', { type: 'manual', message: 'Select a workspace to archive.' });
      return;
    }

    await performAction(
      { workspaceId: activeWorkspace.id, action: isArchived ? 'restore' : 'archive' },
      isArchived
        ? {
            title: 'Workspace restored',
            description: 'The workspace is active again.',
          }
        : {
            title: 'Workspace archived',
            description: 'Members will no longer see this workspace until it is restored.',
          },
    );
  };

  if (!hasSession || !activeWorkspace) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            Manage
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage workspace</DialogTitle>
          <DialogDescription>
            Rename your workspace or archive it if it is no longer needed.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleRename}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="manage-workspace-name">
              Workspace name
            </label>
            <Input
              id="manage-workspace-name"
              placeholder="Workspace name"
              {...form.register('name')}
              disabled={isMutating}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          {form.formState.errors.root ? (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          ) : null}

          <DialogFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={handleArchive} disabled={isMutating}>
              {pendingAction === 'archive' || pendingAction === 'restore'
                ? 'Processing…'
                : isArchived
                  ? 'Restore workspace'
                  : 'Archive workspace'}
            </Button>
            <Button type="submit" disabled={isMutating || isNameUnchanged}>
              {pendingAction === 'rename' ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
