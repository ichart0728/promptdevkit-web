import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  notificationPreferencesQueryKey,
  updateNotificationPreferences,
  type UpdateNotificationPreferencesParams,
} from '../api/notificationPreferences';

export const useUpdateNotificationPreferencesMutation = (userId: string | null) => {
  const queryClient = useQueryClient();
  const queryKey = notificationPreferencesQueryKey(userId);

  return useMutation({
    mutationKey: [...queryKey, 'update'],
    mutationFn: async (params: UpdateNotificationPreferencesParams) => {
      if (!userId) {
        throw new Error('User ID is required to update notification preferences.');
      }

      try {
        return await updateNotificationPreferences(params);
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }

        throw new Error('Failed to update notification preferences.');
      }
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
    },
    onSettled: (_result, error) => {
      if (userId && !error) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
};
