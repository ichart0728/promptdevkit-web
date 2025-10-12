import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { notificationsQueryKey } from './useNotificationsQuery';

type TogglePayload = {
  id: string;
  read: boolean;
};

export const useNotificationReadMutation = (userId: string | null) => {
  const queryClient = useQueryClient();
  const resolvedUserId = userId ?? null;

  return useMutation({
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

      return { id, read, read_at: readAt };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(resolvedUserId) });
    },
  });
};
