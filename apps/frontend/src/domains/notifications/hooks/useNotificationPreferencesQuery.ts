import { useQuery } from '@tanstack/react-query';

import {
  fetchNotificationPreferences,
  notificationPreferencesQueryKey,
} from '../api/notificationPreferences';

export const useNotificationPreferencesQuery = (userId: string | null) => {
  return useQuery({
    queryKey: notificationPreferencesQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required to load notification preferences.');
      }

      return fetchNotificationPreferences(userId);
    },
  });
};
