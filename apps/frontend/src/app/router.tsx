import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { RootLayout } from '@/pages/_layout';
import { DashboardPage } from '@/pages/dashboard';
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

const promptsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prompts',
  component: PromptsPage,
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams',
  component: TeamsPage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, promptsRoute, teamsRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
