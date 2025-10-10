import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { signInWithPassword, type SignInWithPasswordParams } from '../api/sign-in';
import { sessionQueryOptions } from '../api/session';

export const useSignInWithPasswordMutation = (
  options?: Omit<UseMutationOptions<Session | null, Error, SignInWithPasswordParams>, 'mutationFn'>,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signInWithPassword,
    ...options,
    onSuccess: (session, variables, context, mutation) => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, session);
      options?.onSuccess?.(session, variables, context, mutation);
    },
  });
};
