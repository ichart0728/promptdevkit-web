import { supabase } from '@/lib/supabase';

import type { Prompt } from './prompts';
import { mapPromptRowToPrompt, type PromptRow } from './prompts';

export type TrashedPrompt = {
  id: string;
  title: string;
  note: string | null;
  tags: string[];
  deletedAt: string;
  updatedAt: string;
  workspaceId: string;
  workspaceName: string;
};

const mapTrashRowToPrompt = (row: TrashedPromptRow): TrashedPrompt => ({
  id: row.id,
  title: row.title,
  note: row.note,
  tags: row.tags ?? [],
  deletedAt: row.deleted_at,
  updatedAt: row.updated_at,
  workspaceId: row.workspace_id,
  workspaceName: row.workspace_name,
});

export const trashedPromptsQueryKey = (workspaceId: string) =>
  ['prompts', workspaceId, 'trash'] as const;

type TrashedPromptRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  title: string;
  note: string | null;
  tags: string[] | null;
  updated_at: string;
  deleted_at: string;
};

export type FetchTrashedPromptsParams = {
  workspaceId: string;
};

export const fetchTrashedPrompts = async ({
  workspaceId,
}: FetchTrashedPromptsParams): Promise<TrashedPrompt[]> => {
  const { data, error } = await supabase
    .from('workspace_prompt_trash')
    .select('id,workspace_id,workspace_name,title,note,tags,updated_at,deleted_at')
    .eq('workspace_id', workspaceId)
    .order('deleted_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TrashedPromptRow[];

  return rows.map(mapTrashRowToPrompt);
};

type RestorePromptParams = {
  promptId: string;
};

type RestorePromptRpcResponse = PromptRow;

export const restorePrompt = async ({ promptId }: RestorePromptParams): Promise<Prompt> => {
  const { data, error } = await supabase.rpc('restore_prompt_from_trash', {
    p_prompt_id: promptId,
  } as never);

  if (error) {
    throw error;
  }

  const row = data as RestorePromptRpcResponse | null;

  if (!row) {
    throw new Error('Failed to restore prompt. No prompt returned.');
  }

  return mapPromptRowToPrompt(row);
};

type PurgePromptParams = {
  promptId: string;
};

type PurgePromptRpcResponse = { id: string };

export const purgePrompt = async ({ promptId }: PurgePromptParams): Promise<string> => {
  const { data, error } = await supabase.rpc('purge_prompt_from_trash', {
    p_prompt_id: promptId,
  } as never);

  if (error) {
    throw error;
  }

  const row = data as PurgePromptRpcResponse | null;

  if (!row) {
    throw new Error('Failed to purge prompt. No prompt returned.');
  }

  return row.id;
};
