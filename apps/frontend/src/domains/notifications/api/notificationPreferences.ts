import { supabase } from '@/lib/supabase';

export type NotificationPreferencesRow = {
  user_id: string;
  allow_mentions: boolean;
  updated_at: string;
};

export type NotificationPreferences = {
  userId: string;
  allowMentions: boolean;
  updatedAt: string | null;
  isDefault: boolean;
};

const createDefaultNotificationPreferences = (
  userId: string,
): NotificationPreferences => ({
  userId,
  allowMentions: true,
  updatedAt: null,
  isDefault: true,
});

const mapRowToPreferences = (row: NotificationPreferencesRow): NotificationPreferences => ({
  userId: row.user_id,
  allowMentions: row.allow_mentions,
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
    .select('user_id, allow_mentions, updated_at')
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
};

export const updateNotificationPreferences = async ({
  allowMentions,
}: UpdateNotificationPreferencesParams): Promise<NotificationPreferences> => {
  const { data, error } = await supabase.rpc(
    'set_notification_preferences',
    { p_allow_mentions: allowMentions } as never,
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Failed to update notification preferences.');
  }

  return mapRowToPreferences(data as NotificationPreferencesRow);
};
