import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

import { supabase } from '@/lib/supabase';
import { updatePrompt } from '../prompts';
import { fetchPromptVersions, promptVersionsQueryKey } from '../promptVersions';

const supabaseFromMock = supabase.from as unknown as Mock;

describe('promptVersionsQueryKey', () => {
  it('creates a stable tuple keyed by prompt id', () => {
    expect(promptVersionsQueryKey('prompt-1')).toEqual(['prompt-versions', 'prompt-1']);
    expect(promptVersionsQueryKey(null)).toEqual(['prompt-versions', null]);
  });
});

describe('fetchPromptVersions', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('selects the expected columns to satisfy RLS policies and maps rows', async () => {
    const singleRow = {
      id: 'version-1',
      prompt_id: 'prompt-1',
      version: 3,
      title: 'Draft title',
      body: 'Draft body',
      note: null,
      tags: null,
      updated_by: 'user-1',
      restored_from_version: null,
      created_at: '2025-01-01T00:00:00.000Z',
    };

    const orderMock = vi.fn().mockResolvedValue({ data: [singleRow], error: null });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    supabaseFromMock.mockReturnValue({
      select: selectMock,
    } as never);

    const versions = await fetchPromptVersions({ promptId: 'prompt-1' });

    expect(selectMock).toHaveBeenCalledWith(
      'id,prompt_id,version,title,body,note,tags,updated_by,restored_from_version,created_at',
    );
    expect(eqMock).toHaveBeenCalledWith('prompt_id', 'prompt-1');
    expect(orderMock).toHaveBeenCalledWith('version', { ascending: false });
    expect(versions).toEqual([
      {
        id: 'version-1',
        promptId: 'prompt-1',
        version: 3,
        title: 'Draft title',
        body: 'Draft body',
        note: null,
        tags: [],
        updatedBy: 'user-1',
        restoredFromVersion: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('updatePrompt', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it('updates prompt fields and returns the mapped prompt', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'prompt-1',
        title: 'Updated title',
        body: 'Updated body',
        tags: null,
        note: 'Updated note',
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqWorkspaceMock = vi.fn().mockReturnValue({ select: selectMock });
    const eqPromptMock = vi.fn().mockReturnValue({ eq: eqWorkspaceMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqPromptMock });

    supabaseFromMock.mockReturnValue({
      update: updateMock,
    } as never);

    const result = await updatePrompt({
      workspace: { id: 'workspace-1', type: 'personal' },
      userId: 'user-1',
      promptId: 'prompt-1',
      title: 'Updated title',
      body: 'Updated body',
      tags: ['tag-a'],
      note: 'Updated note',
    });

    expect(updateMock).toHaveBeenCalledWith({
      title: 'Updated title',
      body: 'Updated body',
      tags: ['tag-a'],
      note: 'Updated note',
      updated_by: 'user-1',
    });
    expect(eqPromptMock).toHaveBeenCalledWith('id', 'prompt-1');
    expect(eqWorkspaceMock).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(selectMock).toHaveBeenCalledWith('id,title,body,tags,note');
    expect(singleMock).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'prompt-1',
      title: 'Updated title',
      body: 'Updated body',
      tags: [],
      note: 'Updated note',
    });
  });
});
