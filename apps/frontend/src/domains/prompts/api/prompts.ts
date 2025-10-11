import { supabase } from '@/lib/supabase';

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
  workspaceId: string;
};

export const promptsQueryKey = (workspaceId: string) => ['prompts', workspaceId] as const;

export const fetchPrompts = async ({ workspaceId }: FetchPromptsParams): Promise<Prompt[]> => {
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
  workspaceId: string;
  userId: string;
  title: string;
  body: string;
  tags: string[];
};

export const createPrompt = async ({ workspaceId, userId, title, body, tags }: CreatePromptParams) => {
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
