import { useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { NotificationItem } from '../types';

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationsQueryKey = (userId: string | null) => ['notifications', userId] as const;

export const useNotificationsQuery = (userId: string | null) => {
  return useInfiniteQuery({
    queryKey: notificationsQueryKey(userId),
    initialPageParam: 0,
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      if (!userId) {
        return [] as NotificationItem[];
      }

      const page = typeof pageParam === 'number' ? pageParam : 0;
      const from = page * NOTIFICATIONS_PAGE_SIZE;
      const to = from + NOTIFICATIONS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, payload, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      return (data ?? []) as NotificationItem[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === NOTIFICATIONS_PAGE_SIZE ? allPages.length : undefined,
  });
};
