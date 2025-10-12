import { supabase } from '@/lib/supabase';

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
