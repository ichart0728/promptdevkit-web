import { supabase } from '@/lib/supabase';
import type { Workspace } from '@/domains/workspaces/api/workspaces';

type PromptRow = {
  id: string;
  title: string;
  body: string;
  tags: string[] | null;
};

export type Prompt = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

export type FetchPromptsParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
};

export const promptsQueryKey = (workspaceId: string) => ['prompts', workspaceId] as const;

export const fetchPrompts = async ({ workspace }: FetchPromptsParams): Promise<Prompt[]> => {
  const { id: workspaceId } = workspace;
  const { data, error } = await supabase
    .from('prompts')
    .select('id,title,body,tags')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PromptRow[];

  return rows.map((prompt) => ({
    id: prompt.id,
    title: prompt.title,
    body: prompt.body,
    tags: prompt.tags ?? [],
  }));
};

export type CreatePromptParams = {
  workspace: Pick<Workspace, 'id' | 'type'>;
  userId: string;
  title: string;
  body: string;
  tags: string[];
};

export const createPrompt = async ({ workspace, userId, title, body, tags }: CreatePromptParams) => {
  const { id: workspaceId } = workspace;
  const insertPayload = [
    {
      workspace_id: workspaceId,
      title,
      body,
      tags,
      note: null,
      created_by: userId,
      updated_by: userId,
    },
  ];

  const { data, error } = await supabase
    .from('prompts')
    .insert(insertPayload as never[])
    .select('id,title,body,tags')
    .single<PromptRow>();

  if (error) {
    throw error;
  }

  const row = data as PromptRow;

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: row.tags ?? [],
  } satisfies Prompt;
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
