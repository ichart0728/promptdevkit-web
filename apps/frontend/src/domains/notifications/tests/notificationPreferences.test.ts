import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  DEFAULT_DIGEST_HOUR_UTC,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferencesRow,
} from '../api/notificationPreferences';

const {
  fromMock,
  rpcMock,
} = vi.hoisted(() => {
  return {
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

type FromChain = {
  select: Mock;
  eq: Mock;
  maybeSingle: Mock;
};

describe('notificationPreferences api', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  const prepareFromChain = ({
    data,
    error = null,
  }: {
    data: NotificationPreferencesRow | null;
    error?: unknown;
  }) => {
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const maybeSingleMock = vi.fn().mockResolvedValue({ data, error });

    const chain: FromChain = {
      select: selectMock,
      eq: eqMock,
      maybeSingle: maybeSingleMock,
    };

    fromMock.mockReturnValue(chain);

    return chain;
  };

  it('returns mapped preferences when a row exists', async () => {
    const row: NotificationPreferencesRow = {
      user_id: 'user-123',
      allow_mentions: false,
      digest_enabled: true,
      digest_hour_utc: 14,
      updated_at: '2024-05-01T12:00:00.000Z',
    };

    prepareFromChain({ data: row });

    const preferences = await fetchNotificationPreferences(row.user_id);

    expect(fromMock).toHaveBeenCalledWith('notification_preferences');
    expect(preferences).toEqual({
      userId: 'user-123',
      allowMentions: false,
      digestEnabled: true,
      digestHourUtc: 14,
      updatedAt: '2024-05-01T12:00:00.000Z',
      isDefault: false,
    });
  });

  it('falls back to defaults when no preferences exist', async () => {
    prepareFromChain({ data: null });

    const preferences = await fetchNotificationPreferences('user-456');

    expect(preferences).toEqual({
      userId: 'user-456',
      allowMentions: true,
      digestEnabled: false,
      digestHourUtc: DEFAULT_DIGEST_HOUR_UTC,
      updatedAt: null,
      isDefault: true,
    });
  });

  it('throws when fetching preferences fails', async () => {
    const error = new Error('load failed');
    prepareFromChain({ data: null, error });

    await expect(fetchNotificationPreferences('user-789')).rejects.toBe(error);
  });

  it('updates preferences through the RPC and returns mapped data', async () => {
    const row: NotificationPreferencesRow = {
      user_id: 'user-999',
      allow_mentions: true,
      digest_enabled: false,
      digest_hour_utc: 11,
      updated_at: '2024-06-01T08:30:00.000Z',
    };

    rpcMock.mockResolvedValue({ data: row, error: null });

    const result = await updateNotificationPreferences({
      allowMentions: true,
      digestEnabled: false,
      digestHourUtc: 11,
    });

    expect(rpcMock).toHaveBeenCalledWith('set_notification_preferences', {
      p_allow_mentions: true,
      p_digest_enabled: false,
      p_digest_hour_utc: 11,
    });
    expect(result).toEqual({
      userId: 'user-999',
      allowMentions: true,
      digestEnabled: false,
      digestHourUtc: 11,
      updatedAt: '2024-06-01T08:30:00.000Z',
      isDefault: false,
    });
  });

  it('throws when the RPC returns an error', async () => {
    const error = new Error('rpc failed');
    rpcMock.mockResolvedValue({ data: null, error });

    await expect(
      updateNotificationPreferences({ allowMentions: false, digestEnabled: false, digestHourUtc: 9 }),
    ).rejects.toBe(
      error,
    );
  });

  it('throws when the RPC does not return data', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(
      updateNotificationPreferences({ allowMentions: true, digestEnabled: true, digestHourUtc: 10 }),
    ).rejects.toThrow('Failed to update notification preferences.');
  });
});
