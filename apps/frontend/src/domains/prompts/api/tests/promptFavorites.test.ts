import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

import { supabase } from '@/lib/supabase';
import {
  fetchPromptFavorite,
  promptFavoritesQueryKey,
  togglePromptFavorite,
} from '../promptFavorites';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('promptFavoritesQueryKey', () => {
  it('creates a stable tuple keyed by prompt id', () => {
    expect(promptFavoritesQueryKey('prompt-1')).toEqual(['prompt-favorites', 'prompt-1']);
    expect(promptFavoritesQueryKey(null)).toEqual(['prompt-favorites', null]);
  });
});

describe('fetchPromptFavorite', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('selects the favorite row for the given prompt and user', async () => {
    const row = {
      id: 'favorite-1',
      prompt_id: 'prompt-1',
      user_id: 'user-1',
      created_at: '2025-01-01T00:00:00.000Z',
    };

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: row, error: null });
    const eqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqPromptMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchPromptFavorite({ promptId: 'prompt-1', userId: 'user-1' });

    expect(selectMock).toHaveBeenCalledWith('id,prompt_id,user_id,created_at');
    expect(eqPromptMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(maybeSingleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'favorite-1',
      promptId: 'prompt-1',
      userId: 'user-1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('returns null when no favorite exists', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqUserMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqPromptMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const result = await fetchPromptFavorite({ promptId: 'prompt-1', userId: 'user-1' });

    expect(result).toBeNull();
  });
});

describe('togglePromptFavorite', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('inserts a favorite when shouldFavorite is true', async () => {
    const row = {
      id: 'favorite-1',
      prompt_id: 'prompt-1',
      user_id: 'user-1',
      created_at: '2025-01-01T00:00:00.000Z',
    };
    const singleMock = vi.fn().mockResolvedValue({ data: row, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    supabaseFromMock.mockReturnValue({
      insert: insertMock,
    } as never);

    const result = await togglePromptFavorite({
      promptId: 'prompt-1',
      userId: 'user-1',
      shouldFavorite: true,
    });

    expect(insertMock).toHaveBeenCalledWith([
      {
        prompt_id: 'prompt-1',
        user_id: 'user-1',
      },
    ]);
    expect(selectMock).toHaveBeenCalledWith('id,prompt_id,user_id,created_at');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'favorite-1',
      promptId: 'prompt-1',
      userId: 'user-1',
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('deletes the favorite when shouldFavorite is false', async () => {
    const eqUserMock = vi.fn().mockResolvedValue({ error: null });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqUserMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqPromptMock });

    supabaseFromMock.mockReturnValue({
      delete: deleteMock,
    } as never);

    const result = await togglePromptFavorite({
      promptId: 'prompt-1',
      userId: 'user-1',
      shouldFavorite: false,
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(eqPromptMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toBeNull();
  });
});
