import { type PropsWithChildren } from 'react';

import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';

import { useNotificationsSubscription } from '../hooks/useNotificationsSubscription';

export const NotificationsSubscriptionProvider = ({ children }: PropsWithChildren) => {
  const { data: session } = useSessionQuery();
  const userId = session?.user?.id ?? null;

  useNotificationsSubscription(userId);

  return children;
};
