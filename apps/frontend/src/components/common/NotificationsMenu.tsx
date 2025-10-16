import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SVGProps } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import { router } from '@/app/router';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import { useNotificationPreferencesQuery } from '@/domains/notifications/hooks/useNotificationPreferencesQuery';
import { useUpdateNotificationPreferencesMutation } from '@/domains/notifications/hooks/useUpdateNotificationPreferencesMutation';
import type { NotificationItem } from '@/domains/notifications/types';
import {
  countUnreadNotifications,
  countUnreadMentionNotifications,
  flattenNotificationPages,
  getNotificationMessage,
  getNotificationTitle,
  getMentionNavigationSearch,
  isMentionNotification,
} from '@/domains/notifications/utils';

const BellIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

type NotificationsMenuProps = {
  userId: string | null;
};

export const NotificationsMenu = ({ userId }: NotificationsMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const tooltipId = useId();
  const {
    data: preferences,
    error: preferencesError,
    isError: isPreferencesError,
    isPending: isPreferencesPending,
    refetch: refetchPreferences,
  } = useNotificationPreferencesQuery(userId);
  const updatePreferencesMutation = useUpdateNotificationPreferencesMutation(userId);
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useNotificationsQuery(userId);
  const readMutation = useNotificationReadMutation(userId);

  const notifications = useMemo(() => flattenNotificationPages(data?.pages), [data?.pages]);

  const allowMentions = preferences?.allowMentions ?? true;

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);
  const unreadMentionCount = useMemo(
    () => countUnreadMentionNotifications(notifications),
    [notifications],
  );

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);

    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isFetching) {
      return;
    }

    void refetch();
  }, [isOpen, isFetching, refetch]);

  const toggleMenu = () => {
    setIsOpen((previous) => !previous);
  };

  const handleNavigateToMention = useCallback(
    async (notification: NotificationItem) => {
      if (!isMentionNotification(notification)) {
        return;
      }

      const search = getMentionNavigationSearch(notification);

      setIsOpen(false);

      try {
        await router.navigate({ to: '/prompts', search });

        if (!notification.read_at) {
          readMutation.mutate({ id: notification.id, read: true });
        }
      } catch (navigationError) {
        toast({
          title: 'Unable to open mention',
          description:
            navigationError instanceof Error ? navigationError.message : 'Try again in a moment.',
        });
        setIsOpen(true);
      }
    },
    [readMutation],
  );

  const handleToggleRead = (notification: NotificationItem) => {
    readMutation.mutate({ id: notification.id, read: !notification.read_at });
  };

  const handleMarkAllAsRead = () => {
    if (unreadCount === 0) {
      return;
    }

    readMutation.mutateAll();
  };

  const handleNavigateToPage = async () => {
    setIsOpen(false);

    try {
      await router.navigate({ to: '/notifications' });
    } catch (navigationError) {
      toast({
        title: 'Unable to open notifications',
        description: navigationError instanceof Error ? navigationError.message : 'Try again in a moment.',
      });
      setIsOpen(true);
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="group relative inline-flex">
        <Button
          aria-describedby={unreadCount > 0 ? tooltipId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          aria-controls={isOpen ? menuId : undefined}
          className="relative"
          onClick={toggleMenu}
          size="icon"
          type="button"
          variant="ghost"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-destructive px-1 text-xs font-semibold leading-5 text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute -bottom-10 left-1/2 z-20 w-max -translate-x-1/2 rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        >
          {unreadMentionCount > 0 ? `${unreadMentionCount} new mentions` : 'No new mentions'}
        </span>
      </div>
      {isOpen ? (
        <div
          className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-border bg-popover shadow-lg"
          id={menuId}
          role="menu"
          aria-label="Notifications menu"
        >
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <Button
                disabled={readMutation.isMutatingAll || unreadCount === 0}
                onClick={handleMarkAllAsRead}
                size="sm"
                variant="ghost"
              >
                {readMutation.isMutatingAll ? 'Marking…' : 'Mark all'}
              </Button>
            </div>
            {readMutation.markAllError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {readMutation.markAllError instanceof Error
                  ? readMutation.markAllError.message
                  : 'Failed to mark notifications as read.'}
              </p>
            ) : null}
          </div>
          {isPending ? (
            <div className="space-y-3 p-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ) : isError ? (
            <div className="space-y-2 p-4 text-sm">
              <p className="text-destructive">
                {error instanceof Error ? error.message : 'Failed to load notifications.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up!</div>
          ) : (
            <ul className="max-h-80 space-y-3 overflow-y-auto px-4 py-3 text-sm" role="list">
              {notifications.map((notification) => {
                const message = getNotificationMessage(notification);
                const isRead = Boolean(notification.read_at);

                return (
                  <li key={notification.id} className="rounded-md border border-transparent p-3 hover:border-border">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{getNotificationTitle(notification)}</p>
                          {message ? <p className="text-muted-foreground">{message}</p> : null}
                        </div>
                        <span
                          className={`mt-0.5 h-2 w-2 rounded-full ${isRead ? 'bg-muted' : 'bg-primary'}`}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        {isMentionNotification(notification) ? (
                          <div className="flex flex-wrap items-center justify-between gap-2" role="group">
                            <Button
                              onClick={() => void handleNavigateToMention(notification)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Go to discussion
                            </Button>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <time dateTime={notification.created_at}>
                            {new Date(notification.created_at).toLocaleString()}
                          </time>
                          <Button
                            disabled={readMutation.isPending}
                            onClick={() => handleToggleRead(notification)}
                            size="sm"
                            variant="link"
                          >
                            {isRead ? 'Mark as unread' : 'Mark as read'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {hasNextPage ? (
            <div className="border-t border-border px-4 py-2">
              <Button
                className="w-full"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                size="sm"
                variant="outline"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
          <div className="border-t border-border px-4 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Mention alerts</p>
                  <p className="text-xs text-muted-foreground">
                    {allowMentions ? 'Mentions are enabled.' : 'Mentions are muted.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={
                    isPreferencesPending ||
                    updatePreferencesMutation.isPending ||
                    isPreferencesError
                  }
                  onClick={() =>
                    updatePreferencesMutation.mutate({ allowMentions: !allowMentions })
                  }
                >
                  {updatePreferencesMutation.isPending
                    ? 'Saving…'
                    : allowMentions
                      ? 'Turn off'
                      : 'Turn on'}
                </Button>
              </div>
              {isPreferencesError ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-destructive" role="alert">
                    {preferencesError instanceof Error
                      ? preferencesError.message
                      : 'Failed to load notification settings.'}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => void refetchPreferences()}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
              {updatePreferencesMutation.error ? (
                <p className="text-xs text-destructive" role="alert">
                  {updatePreferencesMutation.error instanceof Error
                    ? updatePreferencesMutation.error.message
                    : 'Failed to update notification settings.'}
                </p>
              ) : null}
            </div>
          </div>
          <div className={`px-4 py-2 ${hasNextPage ? 'border-t border-border' : ''}`}>
            <Button size="sm" variant="link" className="px-0" onClick={() => void handleNavigateToPage()}>
              View all
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
