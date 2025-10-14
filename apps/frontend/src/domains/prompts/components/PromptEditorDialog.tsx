import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { promptsQueryKey, type Prompt, updatePrompt } from '../api/prompts';
import {
  fetchPromptVersions,
  promptVersionsQueryKey,
  type PromptVersion,
  restorePromptVersion,
} from '../api/promptVersions';
import type { Workspace } from '@/domains/workspaces/api/workspaces';
import { PromptCommentsPanel } from './PromptCommentsPanel';

const promptEditorSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  tags: z.string().optional(),
  note: z.string().optional(),
});

export type PromptEditorFormValues = z.infer<typeof promptEditorSchema>;

const formatTags = (raw: string | undefined) =>
  raw
    ?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];

const formatTimestamp = (timestamp: string) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.error(error);
    return timestamp;
  }
};

export type PromptEditorDialogProps = {
  open: boolean;
  prompt: Prompt | null;
  workspace: Pick<Workspace, 'id' | 'type'> | null;
  userId: string | null;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'edit' | 'history' | 'discussion';
  initialThreadId?: string | null;
};

export const PromptEditorDialog = ({
  open,
  prompt,
  workspace,
  userId,
  onOpenChange,
  initialTab = 'edit',
  initialThreadId = null,
}: PromptEditorDialogProps) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<'edit' | 'history' | 'discussion'>(initialTab);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const form = useForm<PromptEditorFormValues>({
    resolver: zodResolver(promptEditorSchema),
    defaultValues: {
      title: '',
      body: '',
      tags: '',
      note: '',
    },
  });

  React.useEffect(() => {
    if (!open || !prompt) {
      return;
    }

    form.reset({
      title: prompt.title,
      body: prompt.body,
      tags: prompt.tags.join(', '),
      note: prompt.note ?? '',
    });
    setActiveTab(initialTab);
    setServerError(null);
    setSuccessMessage(null);
  }, [form, open, prompt, initialTab]);

  const promptId = prompt?.id ?? null;
  const promptVersionsQuery = useQuery({
    queryKey: promptVersionsQueryKey(promptId),
    queryFn: () => {
      if (!promptId) {
        throw new Error('Prompt ID is required to fetch versions.');
      }

      return fetchPromptVersions({ promptId });
    },
    enabled: open && activeTab === 'history' && !!promptId,
    staleTime: 60 * 1000,
  });

  const updatePromptMutation = useMutation({
    mutationFn: async (values: PromptEditorFormValues) => {
      if (!prompt) {
        throw new Error('No prompt selected.');
      }

      if (!workspace) {
        throw new Error('You must select a workspace before updating prompts.');
      }

      if (!userId) {
        throw new Error('You must be signed in to update prompts.');
      }

      const payload = {
        workspace,
        userId,
        promptId: prompt.id,
        title: values.title,
        body: values.body,
        tags: formatTags(values.tags),
        note: values.note?.trim() ? values.note.trim() : null,
      };

      return updatePrompt(payload);
    },
    onMutate: () => {
      setServerError(null);
      setSuccessMessage(null);
    },
    onSuccess: (updatedPrompt) => {
      if (!workspace) {
        return;
      }

      form.reset({
        title: updatedPrompt.title,
        body: updatedPrompt.body,
        tags: updatedPrompt.tags.join(', '),
        note: updatedPrompt.note ?? '',
      });
      setSuccessMessage('Prompt updated successfully.');
      queryClient.setQueryData<Prompt[]>(promptsQueryKey(workspace.id), (current) => {
        if (!current) {
          return current;
        }

        return current.map((item) => (item.id === updatedPrompt.id ? { ...item, ...updatedPrompt } : item));
      });
      queryClient.invalidateQueries({ queryKey: promptsQueryKey(workspace.id) });
      queryClient.invalidateQueries({ queryKey: promptVersionsQueryKey(updatedPrompt.id) });
    },
    onError: (error) => {
      setSuccessMessage(null);

      if (error instanceof Error && error.message.trim().length > 0) {
        setServerError(error.message);
        return;
      }

      setServerError('Failed to update prompt. Please try again.');
      console.error(error);
    },
  });

  const restorePromptVersionMutation = useMutation<Prompt, Error, { version: number }>({
    mutationFn: async ({ version }) => {
      if (!prompt) {
        throw new Error('No prompt selected.');
      }

      return restorePromptVersion({ promptId: prompt.id, version });
    },
    onMutate: () => {
      setServerError(null);
      setSuccessMessage(null);
    },
    onSuccess: (restoredPrompt, variables) => {
      form.reset({
        title: restoredPrompt.title,
        body: restoredPrompt.body,
        tags: restoredPrompt.tags.join(', '),
        note: restoredPrompt.note ?? '',
      });
      setActiveTab('edit');
      setSuccessMessage('Prompt version restored successfully.');

      if (workspace) {
        queryClient.setQueryData<Prompt[]>(promptsQueryKey(workspace.id), (current) => {
          if (!current) {
            return current;
          }

          return current.map((item) => (item.id === restoredPrompt.id ? { ...item, ...restoredPrompt } : item));
        });
        queryClient.invalidateQueries({ queryKey: promptsQueryKey(workspace.id) });
      }

      if (prompt) {
        queryClient.invalidateQueries({ queryKey: promptVersionsQueryKey(prompt.id) });
      }

      toast({
        title: 'Prompt version restored',
        description: `Version ${variables.version} has been restored.`,
      });
    },
    onError: (error) => {
      setSuccessMessage(null);

      if (error instanceof Error && error.message.trim().length > 0) {
        setServerError(error.message);
        return;
      }

      setServerError('Failed to restore prompt version. Please try again.');
      console.error(error);
    },
  });

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setServerError(null);
      setSuccessMessage(null);
      setActiveTab('edit');
    }

    onOpenChange(nextOpen);
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!prompt) {
      setServerError('No prompt selected.');
      return;
    }

    try {
      await updatePromptMutation.mutateAsync(values);
    } catch (error) {
      console.error(error);
    }
  });

  const handleRestoreVersion = async (version: number) => {
    if (!prompt) {
      setServerError('No prompt selected.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to restore version ${version}? This will replace the current prompt content.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await restorePromptVersionMutation.mutateAsync({ version });
    } catch (error) {
      console.error(error);
    }
  };

  const renderHistory = () => {
    if (!promptId) {
      return <p className="text-sm text-muted-foreground">Select a prompt to view its history.</p>;
    }

    if (promptVersionsQuery.status === 'pending') {
      return <p className="text-sm text-muted-foreground">Loading version history…</p>;
    }

    if (promptVersionsQuery.status === 'error') {
      return (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">Failed to load version history. Please try again.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => promptVersionsQuery.refetch()}
            disabled={promptVersionsQuery.isFetching}
          >
            Retry
          </Button>
        </div>
      );
    }

    const versions = (promptVersionsQuery.data ?? []) as PromptVersion[];

    if (!versions.length) {
      return <p className="text-sm text-muted-foreground">No versions found for this prompt yet.</p>;
    }

    return (
      <ul className="space-y-3">
        {versions.map((version) => (
          <li key={version.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Version {version.version}</span>
              <span className="text-xs text-muted-foreground">{formatTimestamp(version.createdAt)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Updated by {version.updatedBy}</p>
            {version.restoredFromVersion ? (
              <p className="text-xs text-muted-foreground">
                Restored from version {version.restoredFromVersion}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleRestoreVersion(version.version)}
                disabled={restorePromptVersionMutation.isPending}
              >
                {restorePromptVersionMutation.isPending &&
                restorePromptVersionMutation.variables?.version === version.version
                  ? 'Restoring…'
                  : 'Restore'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const tabs: Array<{ id: 'edit' | 'history' | 'discussion'; label: string }> = [
    { id: 'edit', label: 'Edit' },
    { id: 'history', label: 'History' },
    { id: 'discussion', label: 'Discussion' },
  ];

  const tabButtonClass = (tabId: typeof tabs[number]['id']) =>
    `rounded-md px-3 py-1 font-medium ${
      activeTab === tabId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
    }`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit prompt</DialogTitle>
          <DialogDescription>Update the prompt details or browse previous versions.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3 border-b pb-3 text-sm" role="tablist" aria-label="Prompt editor tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`prompt-editor-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`prompt-editor-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={tabButtonClass(tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id="prompt-editor-panel-edit"
          role="tabpanel"
          aria-labelledby="prompt-editor-tab-edit"
          hidden={activeTab !== 'edit'}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prompt-editor-title">
                Title
              </label>
              <Input id="prompt-editor-title" {...form.register('title')} />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prompt-editor-body">
                Prompt body
              </label>
              <textarea
                id="prompt-editor-body"
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...form.register('body')}
              />
              {form.formState.errors.body ? (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prompt-editor-tags">
                Tags
              </label>
              <Input id="prompt-editor-tags" {...form.register('tags')} placeholder="productivity, meeting" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prompt-editor-note">
                Internal note (optional)
              </label>
              <textarea
                id="prompt-editor-note"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...form.register('note')}
              />
            </div>

            {serverError ? <p className="text-xs text-destructive">{serverError}</p> : null}
            {successMessage ? <p className="text-xs text-emerald-600">{successMessage}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatePromptMutation.isPending || !prompt || !workspace || !userId}>
                {updatePromptMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </div>

        <div
          id="prompt-editor-panel-history"
          role="tabpanel"
          aria-labelledby="prompt-editor-tab-history"
          hidden={activeTab !== 'history'}
          className="space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Each update generates a version so you can audit who made changes and when.
          </p>
          {renderHistory()}
        </div>

        <div
          id="prompt-editor-panel-discussion"
          role="tabpanel"
          aria-labelledby="prompt-editor-tab-discussion"
          hidden={activeTab !== 'discussion'}
        >
          {activeTab === 'discussion' ? (
            <PromptCommentsPanel
              promptId={promptId}
              userId={userId}
              initialThreadId={initialThreadId}
              workspaceId={workspace?.id ?? null}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

