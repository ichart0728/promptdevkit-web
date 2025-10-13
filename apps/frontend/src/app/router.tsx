import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { z } from 'zod';

import { RootLayout } from '@/pages/_layout';
import { DashboardPage } from '@/pages/dashboard';
import { NotificationsPage } from '@/pages/notifications';
import { PromptsPage } from '@/pages/prompts';
import { TeamsPage } from '@/pages/teams';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const promptsSearchSchema = z
  .object({
    q: z.string().optional(),
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => {
        if (!value) {
          return [] as string[];
        }

        const tagsArray = Array.isArray(value) ? value : [value];

        return tagsArray.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      }),
  })
  .transform(({ q, tags }) => {
    const trimmedQuery = q?.trim() ?? '';

    return {
      ...(trimmedQuery.length > 0 ? { q: trimmedQuery } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    } satisfies { q?: string; tags?: string[] };
  });

const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prompts',
  component: PromptsPage,
  validateSearch: (search) => promptsSearchSchema.parse(search),
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
});

const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notifications',
  component: NotificationsPage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, promptsRoute, teamsRoute, notificationsRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
