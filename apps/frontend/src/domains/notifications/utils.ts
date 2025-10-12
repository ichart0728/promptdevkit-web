import type { NotificationItem } from './types';

export const flattenNotificationPages = (pages?: NotificationItem[][]) => {
  if (!pages) {
    return [] as NotificationItem[];
  }

  return pages.reduce<NotificationItem[]>((accumulator, page) => accumulator.concat(page), []);
};

export const getNotificationTitle = (notification: NotificationItem) =>
  typeof notification.payload.title === 'string' && notification.payload.title.trim().length > 0
    ? notification.payload.title
    : 'Notification';

export const getNotificationMessage = (notification: NotificationItem) => {
  const { message, body } = notification.payload;

  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }

  return null;
};

export const countUnreadNotifications = (notifications: NotificationItem[]) =>
  notifications.reduce((count, notification) => count + (notification.read_at ? 0 : 1), 0);
