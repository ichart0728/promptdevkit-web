import { supabase } from '@/lib/supabase';
import type { Prompt } from './prompts';

export const promptVersionsQueryKey = (promptId: string | null) =>
  ['prompt-versions', promptId] as const;

export type FetchPromptVersionsParams = {
  promptId: string;
};

type PromptVersionRow = {
  id: string;
  prompt_id: string;
  version: number;
  title: string;
  body: string;
  note: string | null;
  tags: string[] | null;
  updated_by: string;
  restored_from_version: number | null;
  created_at: string;
};

export type PromptVersion = {
  id: string;
  promptId: string;
  version: number;
  title: string;
  body: string;
  note: string | null;
  tags: string[];
  updatedBy: string;
  restoredFromVersion: number | null;
  createdAt: string;
};

const mapPromptVersionRowToPromptVersion = (row: PromptVersionRow): PromptVersion => ({
  id: row.id,
  promptId: row.prompt_id,
  version: row.version,
  title: row.title,
  body: row.body,
  note: row.note ?? null,
  tags: row.tags ?? [],
  updatedBy: row.updated_by,
  restoredFromVersion: row.restored_from_version ?? null,
  createdAt: row.created_at,
});

export const fetchPromptVersions = async ({
  promptId,
}: FetchPromptVersionsParams): Promise<PromptVersion[]> => {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select(
      'id,prompt_id,version,title,body,note,tags,updated_by,restored_from_version,created_at',
    )
    .eq('prompt_id', promptId)
    .order('version', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PromptVersionRow[];

  return rows.map(mapPromptVersionRowToPromptVersion);
};

type PromptRow = {
  id: string;
  title: string;
  body: string;
  note: string | null;
  tags: string[] | null;
};

const mapPromptRowToPrompt = (row: PromptRow): Prompt => ({
  id: row.id,
  title: row.title,
  body: row.body,
  note: row.note ?? null,
  tags: row.tags ?? [],
});

export type RestorePromptVersionParams = {
  promptId: string;
  version: number;
};

export const restorePromptVersion = async ({
  promptId,
  version,
}: RestorePromptVersionParams): Promise<Prompt> => {
  const { data, error } = await supabase
    .rpc('restore_prompt_version', {
      prompt_id: promptId,
      version,
    } as never);

  if (error) {
    throw error;
  }

  const row = data as PromptRow | null;

  if (!row) {
    throw new Error('Failed to restore prompt version.');
  }

  return mapPromptRowToPrompt(row);
};
