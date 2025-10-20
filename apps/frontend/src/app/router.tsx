import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { RootLayout } from '@/pages/_layout';
import { DashboardPage } from '@/pages/dashboard';
import { NotificationsPage } from '@/pages/notifications';
import { PromptsPage } from '@/pages/prompts';
import { FavoritesPage } from '@/pages/favorites';
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

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: FavoritesPage,
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

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  promptsRoute,
  favoritesRoute,
  teamsRoute,
  notificationsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
