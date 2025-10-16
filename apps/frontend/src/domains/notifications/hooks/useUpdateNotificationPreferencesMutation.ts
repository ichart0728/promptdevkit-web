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
    mutationFn: async (params: UpdateNotificationPreferencesParams) => {
      if (!userId) {
        throw new Error('User ID is required to update notification preferences.');
      }

      return updateNotificationPreferences(params);
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKey, preferences);
    },
    onSettled: () => {
      if (userId) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
};
