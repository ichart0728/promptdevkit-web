import type {
  MentionNotification,
  NotificationItem,
  NotificationPayload,
} from './types';

export const flattenNotificationPages = (pages?: NotificationItem[][]) => {
  if (!pages) {
    return [] as NotificationItem[];
  }

  return pages.reduce<NotificationItem[]>((accumulator, page) => accumulator.concat(page), []);
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const getNotificationTitle = (notification: NotificationItem) =>
  isNonEmptyString(notification.payload.title)
    ? notification.payload.title
    : 'Notification';

export const getNotificationMessage = (notification: NotificationItem) => {
  const { message, body } = notification.payload;

  if (isNonEmptyString(message)) {
    return message;
  }

  if (isNonEmptyString(body)) {
    return body;
  }

  return null;
};

export const countUnreadNotifications = (notifications: NotificationItem[]) =>
  notifications.reduce((count, notification) => count + (notification.read_at ? 0 : 1), 0);

const hasValidMentionThreadId = (threadId: unknown): threadId is string | null | undefined =>
  threadId === null || threadId === undefined || isNonEmptyString(threadId);

const isMentionPayload = (payload: NotificationPayload): payload is MentionNotification['payload'] => {
  const promptId = payload['prompt_id'];
  const threadId = payload['thread_id'];

  return isNonEmptyString(promptId) && hasValidMentionThreadId(threadId);
};

export const isMentionNotification = (notification: NotificationItem): notification is MentionNotification =>
  notification.type === 'mention' && isMentionPayload(notification.payload);

export type MentionNavigationSearch = { promptId: string; threadId?: string; commentId?: string };

export const getMentionNavigationSearch = (notification: MentionNotification): MentionNavigationSearch => {
  const promptId = notification.payload['prompt_id'];
  const threadIdRaw = notification.payload['thread_id'];
  const threadId = isNonEmptyString(threadIdRaw) ? threadIdRaw : undefined;
  const commentIdRaw = notification.payload['comment_id'];
  const commentId = isNonEmptyString(commentIdRaw) ? commentIdRaw : undefined;

  return {
    promptId,
    ...(threadId ? { threadId } : {}),
    ...(commentId ? { commentId } : {}),
  };
};

export const countUnreadMentionNotifications = (notifications: NotificationItem[]) =>
  notifications.reduce(
    (count, notification) => count + (!notification.read_at && isMentionNotification(notification) ? 1 : 0),
    0,
  );
