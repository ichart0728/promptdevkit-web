import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

import { SessionProvider } from '@/domains/auth/components/SessionProvider';

import { queryClient } from './queryClient';
import { router } from './router';

export const AppProviders = () => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
    {import.meta.env.DEV ? (
      <>
        <ReactQueryDevtools buttonPosition="bottom-right" initialIsOpen={false} />
        <TanStackRouterDevtools router={router} position="bottom-left" />
      </>
    ) : null}
  </QueryClientProvider>
);
