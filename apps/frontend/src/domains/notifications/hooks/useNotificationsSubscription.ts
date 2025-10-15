import { useEffect } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import type { NotificationItem } from '../types';
import { NOTIFICATIONS_PAGE_SIZE, notificationsQueryKey } from './useNotificationsQuery';

type NotificationsInfiniteData = InfiniteData<NotificationItem[], number>;

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: NotificationItem['payload'] | null;
  read_at: string | null;
  created_at: string;
};

const mapRowToNotification = (row: NotificationRow | null): NotificationItem | null => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    type: row.type,
    payload: (row.payload ?? {}) as NotificationItem['payload'],
    read_at: row.read_at,
    created_at: row.created_at,
  };
};

const applyInsert = (
  previous: NotificationsInfiniteData,
  notification: NotificationItem,
): NotificationsInfiniteData => {
  if (previous.pages.length === 0) {
    return previous;
  }

  const pages = previous.pages.map((page, index) => {
    if (index === 0) {
      const nextPage = [notification, ...page];

      if (nextPage.length > NOTIFICATIONS_PAGE_SIZE) {
        return nextPage.slice(0, NOTIFICATIONS_PAGE_SIZE);
      }

      return nextPage;
    }

    return page;
  });

  return {
    ...previous,
    pages,
  };
};

const applyUpdate = (
  previous: NotificationsInfiniteData,
  notification: NotificationItem,
): NotificationsInfiniteData => ({
  ...previous,
  pages: previous.pages.map((page) =>
    page.map((current) => (current.id === notification.id ? notification : current)),
  ),
});

const applyDelete = (
  previous: NotificationsInfiniteData,
  notificationId: string,
): NotificationsInfiniteData => ({
  ...previous,
  pages: previous.pages.map((page) => page.filter((current) => current.id !== notificationId)),
});

export const useNotificationsSubscription = (userId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const queryKey = notificationsQueryKey(userId);

    const handleChange = (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
      const { eventType } = payload;

      if (eventType === 'INSERT') {
        const notification = mapRowToNotification(payload.new);

        if (!notification) {
          return;
        }

        queryClient.setQueryData(queryKey, (previous: NotificationsInfiniteData | undefined) => {
          if (!previous) {
            return previous;
          }

          return applyInsert(previous, notification);
        });
        void queryClient.invalidateQueries({ queryKey });

        return;
      }

      if (eventType === 'UPDATE') {
        const notification = mapRowToNotification(payload.new);

        if (!notification) {
          return;
        }

        queryClient.setQueryData(queryKey, (previous: NotificationsInfiniteData | undefined) => {
          if (!previous) {
            return previous;
          }

          return applyUpdate(previous, notification);
        });

        return;
      }

      if (eventType === 'DELETE') {
        const notificationId = payload.old?.id;

        if (!notificationId) {
          return;
        }

        queryClient.setQueryData(queryKey, (previous: NotificationsInfiniteData | undefined) => {
          if (!previous) {
            return previous;
          }

          return applyDelete(previous, notificationId);
        });
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const channel = supabase
      .channel(`notifications:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        handleChange,
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [queryClient, userId]);
};
