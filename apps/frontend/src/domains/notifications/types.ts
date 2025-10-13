export type NotificationPayload = {
  title?: string;
  message?: string;
  body?: string;
  action_url?: string;
  prompt_id?: unknown;
  thread_id?: unknown;
  [key: string]: unknown;
};

export type NotificationItem = {
  id: string;
  type: string;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
};

export type MentionNotificationPayload = NotificationPayload & {
  prompt_id: string;
  thread_id?: string | null;
};

export type MentionNotification = NotificationItem & {
  type: 'mention';
  payload: MentionNotificationPayload;
};
