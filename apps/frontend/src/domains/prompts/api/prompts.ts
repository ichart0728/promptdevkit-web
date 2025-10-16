import { supabase } from '@/lib/supabase';
import type { Workspace } from '@/domains/workspaces/api/workspaces';

export type PromptRow = {
  id: string;
  title: string;
  body: string;
  tags: string[] | null;
  note: string | null;
};

export type Prompt = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  note?: string | null;
};

export const mapPromptRowToPrompt = (row: PromptRow): Prompt => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tags: row.tags ?? [],
  note: row.note ?? null,
});

export type FetchPromptsParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
};

export const promptsQueryKey = (workspaceId: string) => ['prompts', workspaceId] as const;

export const fetchPrompts = async ({ workspace }: FetchPromptsParams): Promise<Prompt[]> => {
  const { id: workspaceId } = workspace;
  const { data, error } = await supabase
    .from('prompts')
    .select('id,title,body,tags,note')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PromptRow[];

  return rows.map(mapPromptRowToPrompt);
};

export type CreatePromptParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  note?: string | null;
};

export const createPrompt = async ({
  workspace,
  userId,
  title,
  body,
  tags,
  note = null,
}: CreatePromptParams) => {
  const { id: workspaceId } = workspace;
  const insertPayload = [
    {
      workspace_id: workspaceId,
      title,
      body,
      tags,
      note,
      created_by: userId,
      updated_by: userId,
    },
  ];

  const { data, error } = await supabase
    .from('prompts')
    .insert(insertPayload as never[])
    .select('id,title,body,tags,note')
    .single<PromptRow>();

  if (error) {
    throw error;
  }

  const row = data as PromptRow;

  return mapPromptRowToPrompt(row);
};

export type DuplicatePromptParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
  userId: string;
  promptId: string;
};

export const duplicatePrompt = async ({ workspace, userId, promptId }: DuplicatePromptParams) => {
  const { id: workspaceId } = workspace;

  const { data: sourcePrompt, error: fetchError } = await supabase
    .from('prompts')
    .select('title,body,tags,note')
    .eq('id', promptId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .single<PromptRow>();

  if (fetchError) {
    throw fetchError;
  }

  const original = sourcePrompt as PromptRow;

  return createPrompt({
    workspace,
    userId,
    title: original.title,
    body: original.body,
    tags: original.tags ?? [],
    note: original.note ?? null,
  });
};

export type UpdatePromptParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
  userId: string;
  promptId: string;
  title: string;
  body: string;
  tags: string[];
  note: string | null;
};

export const updatePrompt = async ({
  workspace,
  userId,
  promptId,
  title,
  body,
  tags,
  note,
}: UpdatePromptParams) => {
  const { id: workspaceId } = workspace;

  const { data, error } = await supabase
    .from('prompts')
    .update({
      title,
      body,
      tags,
      note,
      updated_by: userId,
    } as never)
    .eq('id', promptId)
    .eq('workspace_id', workspaceId)
    .select('id,title,body,tags,note')
    .single<PromptRow>();

  if (error) {
    throw error;
  }

  return mapPromptRowToPrompt(data as PromptRow);
};

export type DeletePromptParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
  userId: string;
  promptId: string;
};

export const deletePrompt = async ({ workspace, userId, promptId }: DeletePromptParams) => {
  const { id: workspaceId } = workspace;
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('prompts')
    .update(
      {
        deleted_at: timestamp,
        updated_by: userId,
      } as never,
    )
    .eq('id', promptId)
    .eq('workspace_id', workspaceId)
    .select('id')
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
};
