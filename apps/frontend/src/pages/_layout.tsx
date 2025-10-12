import { useMemo } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { AuthMenu } from '@/domains/auth/components/AuthMenu';
import { WorkspaceSwitcher } from '@/components/common/WorkspaceSwitcher';
import { CreateWorkspaceDialog } from '@/domains/workspaces/components/CreateWorkspaceDialog';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import {
  countUnreadNotifications,
  flattenNotificationPages,
} from '@/domains/notifications/utils';

type NavigationItem = {
  to: string;
  label: string;
  unreadCount?: number;
};

const baseNavigation: NavigationItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/prompts', label: 'Prompts' },
  { to: '/teams', label: 'Teams' },
];

export const RootLayout = () => {
  const { location } = useRouterState();
  const { data: session } = useSessionQuery();
  const userId = session?.user?.id ?? null;
  const { data: notificationsData } = useNotificationsQuery(userId);

  const notifications = useMemo(
    () => flattenNotificationPages(notificationsData?.pages),
    [notificationsData?.pages],
  );
  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);

  const navigation = useMemo(() => {
    if (!userId) {
      return baseNavigation;
    }

    return [...baseNavigation, { to: '/notifications', label: 'Notifications', unreadCount }];
  }, [userId, unreadCount]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex items-center justify-between py-4">
          <Link className="text-lg font-semibold" to="/">
            PromptDevKit
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.to;
                const displayUnreadCount = item.unreadCount ?? 0;

                return (
                  <Button
                    key={item.to}
                    asChild
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                  >
                    <Link to={item.to} className="flex items-center gap-2">
                      <span>{item.label}</span>
                      {displayUnreadCount > 0 ? (
                        <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-5 text-destructive-foreground">
                          {displayUnreadCount > 9 ? '9+' : displayUnreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </Button>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <WorkspaceSwitcher />
              <CreateWorkspaceDialog />
            </div>
            <AuthMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
