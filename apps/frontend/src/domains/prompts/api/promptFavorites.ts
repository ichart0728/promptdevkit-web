import { supabase } from '@/lib/supabase';

export type PromptFavorite = {
  id: string;
  promptId: string;
  userId: string;
  createdAt: string;
};

type PromptFavoriteRow = {
  id: string;
  prompt_id: string;
  user_id: string;
  created_at: string;
};

const mapPromptFavoriteRow = (row: PromptFavoriteRow): PromptFavorite => ({
  id: row.id,
  promptId: row.prompt_id,
  userId: row.user_id,
  createdAt: row.created_at,
});

export const promptFavoritesQueryKey = (promptId: string | null) =>
  ['prompt-favorites', promptId] as const;

export type FetchPromptFavoritesParams = {
  promptId: string;
  userId: string;
};

export const fetchPromptFavorite = async ({
  promptId,
  userId,
}: FetchPromptFavoritesParams): Promise<PromptFavorite | null> => {
  const { data, error } = await supabase
    .from('prompt_favorites')
    .select('id,prompt_id,user_id,created_at')
    .eq('prompt_id', promptId)
    .eq('user_id', userId)
    .maybeSingle<PromptFavoriteRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapPromptFavoriteRow(data as PromptFavoriteRow);
};

export type TogglePromptFavoriteParams = {
  promptId: string;
  userId: string;
  shouldFavorite: boolean;
};

export const togglePromptFavorite = async ({
  promptId,
  userId,
  shouldFavorite,
}: TogglePromptFavoriteParams): Promise<PromptFavorite | null> => {
  if (shouldFavorite) {
    const { data, error } = await supabase
      .from('prompt_favorites')
      .insert(
        [
          {
            prompt_id: promptId,
            user_id: userId,
          },
        ] as never[],
      )
      .select('id,prompt_id,user_id,created_at')
      .single<PromptFavoriteRow>();

    if (error) {
      throw error;
    }

    return mapPromptFavoriteRow(data as PromptFavoriteRow);
  }

  const { error } = await supabase
    .from('prompt_favorites')
    .delete()
    .eq('prompt_id', promptId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return null;
};
