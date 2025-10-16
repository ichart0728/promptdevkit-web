import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import { router } from '@/app/router';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import { useNotificationPreferencesQuery } from '@/domains/notifications/hooks/useNotificationPreferencesQuery';
import { useUpdateNotificationPreferencesMutation } from '@/domains/notifications/hooks/useUpdateNotificationPreferencesMutation';
import type { NotificationItem } from '@/domains/notifications/types';
import {
  countUnreadMentionNotifications,
  countUnreadNotifications,
  flattenNotificationPages,
  getNotificationMessage,
  getNotificationTitle,
  getMentionNavigationSearch,
  isMentionNotification,
} from '@/domains/notifications/utils';

type NotificationFilter = 'all' | 'unread' | 'mentions';

export const NotificationsPage = () => {
  const { data: session, isPending: isSessionPending } = useSessionQuery();
  const userId = session?.user?.id ?? null;
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
    isFetchingNextPage,
    isPending,
    refetch,
  } = useNotificationsQuery(userId);
  const readMutation = useNotificationReadMutation(userId);

  const notifications = useMemo(() => flattenNotificationPages(data?.pages), [data?.pages]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [allowMentions, setAllowMentions] = useState(true);
  const preferenceAllowMentions = preferences?.allowMentions;

  useEffect(() => {
    if (typeof preferenceAllowMentions !== 'boolean') {
      return;
    }

    setAllowMentions(preferenceAllowMentions);
  }, [preferenceAllowMentions]);

  const hasPreferenceChanges =
    typeof preferenceAllowMentions === 'boolean'
      ? allowMentions !== preferenceAllowMentions
      : false;

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);
  const unreadMentionsCount = useMemo(
    () => countUnreadMentionNotifications(notifications),
    [notifications],
  );
  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((notification) => !notification.read_at);
    }

    if (filter === 'mentions') {
      return notifications.filter((notification) => isMentionNotification(notification));
    }

    return notifications;
  }, [filter, notifications]);

  const totalVisibleCount = filteredNotifications.length;
  const displayedUnreadCount = filter === 'mentions' ? unreadMentionsCount : unreadCount;
  const hasAnyNotifications = notifications.length > 0;

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage) {
      return;
    }

    const target = loadMoreRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      });
    }, { rootMargin: '200px 0px 0px 0px' });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleToggleRead = (notificationId: string, isRead: boolean) => {
    readMutation.mutate({ id: notificationId, read: !isRead });
  };

  const handleSavePreferences = () => {
    if (
      isPreferencesPending ||
      updatePreferencesMutation.isPending ||
      typeof preferenceAllowMentions !== 'boolean'
    ) {
      return;
    }

    updatePreferencesMutation.mutate({ allowMentions });
  };

  const handleMarkAllAsRead = () => {
    if (displayedUnreadCount === 0) {
      return;
    }

    if (filter === 'mentions') {
      readMutation.mutateMentions();
      return;
    }

    readMutation.mutateAll();
  };

  const handleNavigateToMention = async (notification: NotificationItem) => {
    if (!isMentionNotification(notification)) {
      return;
    }

    const search = getMentionNavigationSearch(notification);

    try {
      await router.navigate({ to: '/prompts', search });

      if (!notification.read_at) {
        readMutation.mutate({ id: notification.id, read: true });
      }
    } catch (navigationError) {
      toast({
        title: 'Unable to open mention',
        description: navigationError instanceof Error ? navigationError.message : 'Try again in a moment.',
      });
    }
  };

  if (isSessionPending) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Loading your session…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Sign in to view your notifications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Review the latest alerts and updates across your workspaces.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2" role="group" aria-label="Filter notifications">
            {(
              [
                { label: 'All', value: 'all' },
                { label: 'Unread', value: 'unread' },
                { label: 'Mentions', value: 'mentions' },
              ] as const
            ).map(({ label, value }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                aria-pressed={filter === value}
                data-testid={`notifications-filter-${value}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {filter === 'mentions' ? 'Unread mentions' : 'Unread'}: {displayedUnreadCount}
          </span>
          <Button
            disabled={readMutation.isMutatingAll || displayedUnreadCount === 0}
            onClick={handleMarkAllAsRead}
            size="sm"
            variant="outline"
          >
            {readMutation.isMutatingAll
              ? 'Marking…'
              : filter === 'mentions'
                ? 'Mark mentions as read'
                : filter === 'unread'
                  ? 'Mark unread as read'
                  : 'Mark all as read'}
          </Button>
        </div>
      </div>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Notification settings</h2>
            <p className="text-sm text-muted-foreground">
              Choose how we notify you when someone mentions you.
            </p>
            {isPreferencesError ? (
              <p className="text-sm text-destructive" role="alert">
                {preferencesError instanceof Error
                  ? preferencesError.message
                  : 'Failed to load notification settings.'}
              </p>
            ) : null}
            {updatePreferencesMutation.error ? (
              <p className="text-sm text-destructive" role="alert">
                {updatePreferencesMutation.error instanceof Error
                  ? updatePreferencesMutation.error.message
                  : 'Failed to save notification settings.'}
              </p>
            ) : null}
            {updatePreferencesMutation.isSuccess && !hasPreferenceChanges ? (
              <p className="text-xs text-muted-foreground" role="status">
                Preferences saved.
              </p>
            ) : null}
          </div>
          <div className="flex max-w-sm flex-col items-start gap-3 sm:items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-border"
                checked={allowMentions}
                onChange={(event) => setAllowMentions(event.target.checked)}
                disabled={isPreferencesPending || updatePreferencesMutation.isPending}
              />
              Allow mention notifications
            </label>
            <p className="text-xs text-muted-foreground">
              {allowMentions
                ? 'Receive alerts when teammates mention you. Turn this off to silence mention notifications.'
                : 'Mentions will stop sending alerts, but you can still find them in the notifications list.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSavePreferences}
                disabled={!hasPreferenceChanges || updatePreferencesMutation.isPending || isPreferencesPending}
              >
                {updatePreferencesMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasPreferenceChanges || updatePreferencesMutation.isPending}
                onClick={() => {
                  if (typeof preferenceAllowMentions === 'boolean') {
                    setAllowMentions(preferenceAllowMentions);
                  }
                }}
              >
                Reset
              </Button>
              {isPreferencesError ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void refetchPreferences()}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {readMutation.markAllError ? (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {readMutation.markAllError instanceof Error
            ? readMutation.markAllError.message
            : 'Failed to mark notifications as read.'}
        </div>
      ) : null}
      {isPending ? (
        <div className="space-y-4">
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-md bg-muted" />
            <div className="h-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ) : isError ? (
        <div className="space-y-3 text-sm">
          <p className="text-destructive">
            {error instanceof Error ? error.message : 'Failed to load notifications.'}
          </p>
          <Button onClick={() => void refetch()} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {totalVisibleCount > 0 ? (
            <ul className="space-y-4" role="list">
              {filteredNotifications.map((notification) => {
              const message = getNotificationMessage(notification);
              const isRead = Boolean(notification.read_at);

              return (
                <li
                  key={notification.id}
                  className={`rounded-lg border px-4 py-3 transition ${
                    isRead ? 'border-border bg-background' : 'border-primary/30 bg-primary/5'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {getNotificationTitle(notification)}
                        </p>
                        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
                      </div>
                      <span
                        aria-hidden="true"
                        className={`flex h-2 w-2 shrink-0 rounded-full ${isRead ? 'bg-muted' : 'bg-primary'}`}
                      />
                    </div>
                    <div className="flex flex-col gap-3 text-xs text-muted-foreground">
                      {isMentionNotification(notification) ? (
                        <div className="flex flex-wrap items-center gap-2" role="group">
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
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <time dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString()}
                        </time>
                        <Button
                          disabled={readMutation.isPending}
                          onClick={() => handleToggleRead(notification.id, isRead)}
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
          ) : (
            <div className="rounded-md border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {hasAnyNotifications
                  ? 'No notifications match this filter. Try a different selection.'
                  : 'You’re all caught up! New notifications will appear here.'}
              </p>
            </div>
          )}
          <div ref={loadMoreRef} data-testid="notifications-load-more-sentinel" className="h-px w-full" />
          {hasNextPage ? (
            <div className="flex justify-center">
              <Button
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                variant="outline"
              >
                {isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
