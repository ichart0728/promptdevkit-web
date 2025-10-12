export type NotificationPayload = {
  title?: string;
  message?: string;
  body?: string;
  action_url?: string;
  [key: string]: unknown;
};

export type NotificationItem = {
  id: string;
  type: string;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
};
