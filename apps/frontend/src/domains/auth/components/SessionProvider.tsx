import { type PropsWithChildren, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { subscribeToSessionChanges } from '../api/session';
import { useSessionQuery } from '../hooks/useSessionQuery';

export const SessionProvider = ({ children }: PropsWithChildren) => {
  useSessionQuery();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = subscribeToSessionChanges(queryClient);

    return () => {
      data?.subscription.unsubscribe();
    };
  }, [queryClient]);

  return children;
};
