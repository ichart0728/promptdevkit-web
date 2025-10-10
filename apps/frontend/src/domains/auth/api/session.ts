import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export const sessionQueryOptions = queryOptions({
  queryKey: ['auth', 'session'] as const,
  queryFn: async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    return data.session ?? null;
  },
  staleTime: Infinity,
});

export const subscribeToSessionChanges = (queryClient: QueryClient) =>
  supabase.auth.onAuthStateChange((_event, session) => {
    queryClient.setQueryData(sessionQueryOptions.queryKey, session ?? null);
  });
