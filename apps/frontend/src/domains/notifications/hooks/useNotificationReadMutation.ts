import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { NotificationItem } from '../types';
import { notificationsQueryKey } from './useNotificationsQuery';

type TogglePayload = {
  id: string;
  read: boolean;
};

type NotificationsInfiniteData = InfiniteData<NotificationItem[], number>;

type MutationError = {
  code?: string;
  message?: string;
};

export const useNotificationReadMutation = (userId: string | null) => {
  const queryClient = useQueryClient();
  const resolvedUserId = userId ?? null;
  const queryKey = notificationsQueryKey(resolvedUserId);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, read }: TogglePayload) => {
      if (!resolvedUserId) {
        throw new Error('User ID is required to update notifications.');
      }

      const readAt = read ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('notifications')
        .update({ read_at: readAt } as never)
        .eq('id', id)
        .eq('user_id', resolvedUserId);

      if (error) {
        throw error;
      }

      return { id, read_at: readAt };
    },
    onSuccess: ({ id, read_at }) => {
      queryClient.setQueryData(queryKey, (previous: NotificationsInfiniteData | undefined) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          pages: previous.pages.map((page) =>
            page.map((notification) =>
              notification.id === id ? { ...notification, read_at } : notification,
            ),
          ),
        };
      });
    },
    onSettled: () => {
      if (resolvedUserId) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedUserId) {
        throw new Error('User ID is required to update notifications.');
      }

      const readAt = new Date().toISOString();

      const { error } = await supabase
        .from('notifications')
        .update({ read_at: readAt } as never)
        .eq('user_id', resolvedUserId)
        .is('read_at', null);

      if (error) {
        const mutationError = error as MutationError;

        if (mutationError.code === 'P0001') {
          throw new Error('You do not have permission to mark all notifications as read.');
        }

        throw error;
      }

      return readAt;
    },
    onSuccess: (readAt) => {
      queryClient.setQueryData(queryKey, (previous: NotificationsInfiniteData | undefined) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          pages: previous.pages.map((page) =>
            page.map((notification) =>
              notification.read_at ? notification : { ...notification, read_at: readAt },
            ),
          ),
        };
      });
    },
    onSettled: () => {
      if (resolvedUserId) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  return {
    ...toggleMutation,
    mutateAll: markAllMutation.mutate,
    mutateAllAsync: markAllMutation.mutateAsync,
    isMutatingAll: markAllMutation.isPending,
    markAllError: markAllMutation.error,
  };
};
