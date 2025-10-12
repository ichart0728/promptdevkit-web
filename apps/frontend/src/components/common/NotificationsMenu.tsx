import { useEffect, useMemo, useRef, useState } from 'react';
import type { SVGProps } from 'react';

import { Button } from '@/components/ui/button';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import type { NotificationItem } from '@/domains/notifications/types';
import {
  countUnreadNotifications,
  flattenNotificationPages,
  getNotificationMessage,
  getNotificationTitle,
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

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);

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

  if (!userId) {
    return null;
  }

  const toggleMenu = () => {
    setIsOpen((previous) => !previous);
  };

  const handleToggleRead = (notification: NotificationItem) => {
    readMutation.mutate({ id: notification.id, read: !notification.read_at });
  };

  const handleMarkAllAsRead = () => {
    if (unreadCount === 0) {
      return;
    }

    readMutation.mutateAll();
  };

  const handleNavigateToPage = () => {
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
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
      {isOpen ? (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-border bg-popover shadow-lg">
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
            <ul className="max-h-80 space-y-3 overflow-y-auto px-4 py-3 text-sm">
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
          <div className={`px-4 py-2 ${hasNextPage ? 'border-t border-border' : ''}`}>
            <Button asChild size="sm" variant="link" className="px-0" onClick={handleNavigateToPage}>
              <a href="/notifications">View all</a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
