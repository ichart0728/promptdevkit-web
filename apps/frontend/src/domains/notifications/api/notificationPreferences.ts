import { supabase } from '@/lib/supabase';

export type NotificationPreferencesRow = {
  user_id: string;
  allow_mentions: boolean;
  digest_enabled: boolean;
  digest_hour_utc: number;
  updated_at: string;
};

export type NotificationPreferences = {
  userId: string;
  allowMentions: boolean;
  digestEnabled: boolean;
  digestHourUtc: number;
  updatedAt: string | null;
  isDefault: boolean;
};

export const DEFAULT_DIGEST_HOUR_UTC = 9;

const createDefaultNotificationPreferences = (
  userId: string,
): NotificationPreferences => ({
  userId,
  allowMentions: true,
  digestEnabled: false,
  digestHourUtc: DEFAULT_DIGEST_HOUR_UTC,
  updatedAt: null,
  isDefault: true,
});

const mapRowToPreferences = (row: NotificationPreferencesRow): NotificationPreferences => ({
  userId: row.user_id,
  allowMentions: row.allow_mentions,
  digestEnabled: row.digest_enabled,
  digestHourUtc: row.digest_hour_utc,
  updatedAt: row.updated_at ?? null,
  isDefault: false,
});

export const notificationPreferencesQueryKey = (userId: string | null) =>
  ['notification-preferences', userId] as const;

export const fetchNotificationPreferences = async (
  userId: string,
): Promise<NotificationPreferences> => {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('user_id, allow_mentions, digest_enabled, digest_hour_utc, updated_at')
    .eq('user_id', userId)
    .maybeSingle<NotificationPreferencesRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return createDefaultNotificationPreferences(userId);
  }

  return mapRowToPreferences(data);
};

export type UpdateNotificationPreferencesParams = {
  allowMentions: boolean;
  digestEnabled: boolean;
  digestHourUtc: number;
};

export const updateNotificationPreferences = async ({
  allowMentions,
  digestEnabled,
  digestHourUtc,
}: UpdateNotificationPreferencesParams): Promise<NotificationPreferences> => {
  const { data, error } = await supabase.rpc(
    'set_notification_preferences',
    {
      p_allow_mentions: allowMentions,
      p_digest_enabled: digestEnabled,
      p_digest_hour_utc: digestHourUtc,
    } as never,
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update notification preferences.');
  }

  return mapRowToPreferences(data as NotificationPreferencesRow);
};
