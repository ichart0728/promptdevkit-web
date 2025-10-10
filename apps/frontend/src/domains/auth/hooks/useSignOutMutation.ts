import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';

import { signOut } from '../api/sign-out';
import { sessionQueryOptions } from '../api/session';

export const useSignOutMutation = (
  options?: Omit<UseMutationOptions<void, Error, void>, 'mutationFn'>,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    ...options,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);
      options?.onSuccess?.(data, variables, context, mutation);
    },
  });
};
