import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/common/toast';
import { router } from '@/app/router';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import { useNotificationPreferencesQuery } from '@/domains/notifications/hooks/useNotificationPreferencesQuery';
import { useUpdateNotificationPreferencesMutation } from '@/domains/notifications/hooks/useUpdateNotificationPreferencesMutation';
import { DEFAULT_DIGEST_HOUR_UTC } from '@/domains/notifications/api/notificationPreferences';
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

type NotificationPreferencesFormValues = {
  allowMentions: boolean;
  digestEnabled: boolean;
  digestHourUtc: number;
};

const DIGEST_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);

const formatDigestHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

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
  const {
    handleSubmit,
    register,
    reset,
    watch,
    formState: { isDirty },
  } = useForm<NotificationPreferencesFormValues>({
    defaultValues: {
      allowMentions: true,
      digestEnabled: false,
      digestHourUtc: DEFAULT_DIGEST_HOUR_UTC,
    },
  });

  const allowMentions = watch('allowMentions');
  const digestEnabled = watch('digestEnabled');
  const digestHourUtc = watch('digestHourUtc');

  const allowMentionsSwitchId = useId();
  const digestEnabledSwitchId = useId();
  const digestHourSelectId = useId();

  useEffect(() => {
    if (!preferences) {
      return;
    }

    reset(
      {
        allowMentions: preferences.allowMentions,
        digestEnabled: preferences.digestEnabled,
        digestHourUtc: preferences.digestHourUtc,
      },
      { keepDirty: false },
    );
  }, [preferences, reset]);

  const hasPreferenceChanges = !isPreferencesPending && isDirty;

  const disablePreferencesFields = isPreferencesPending || updatePreferencesMutation.isPending;
  const preferencesErrorMessage =
    preferencesError instanceof Error
      ? preferencesError.message
      : 'Failed to load notification settings.';
  const updatePreferencesErrorMessage =
    updatePreferencesMutation.error instanceof Error
      ? updatePreferencesMutation.error.message
      : 'Failed to save notification settings.';
  const showPreferencesSaved = updatePreferencesMutation.isSuccess && !hasPreferenceChanges;

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

  const handleSavePreferences = handleSubmit((values) => {
    if (isPreferencesPending || updatePreferencesMutation.isPending) {
      return;
    }

    updatePreferencesMutation.mutate(values);
  });

  const handleResetPreferences = () => {
    if (!preferences) {
      return;
    }

    reset(
      {
        allowMentions: preferences.allowMentions,
        digestEnabled: preferences.digestEnabled,
        digestHourUtc: preferences.digestHourUtc,
      },
      { keepDirty: false },
    );
    updatePreferencesMutation.reset();
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
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          onSubmit={handleSavePreferences}
        >
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Notification settings</h2>
            <p className="text-sm text-muted-foreground">
              Choose how we notify you when someone mentions you or send daily digests.
            </p>
            {isPreferencesError ? (
              <p className="text-sm text-destructive" role="alert">
                {preferencesErrorMessage}
              </p>
            ) : null}
            {updatePreferencesMutation.error ? (
              <p className="text-sm text-destructive" role="alert">
                {updatePreferencesErrorMessage}
              </p>
            ) : null}
            {showPreferencesSaved ? (
              <p className="text-xs text-muted-foreground" role="status">
                Preferences saved.
              </p>
            ) : null}
          </div>
          <div className="flex max-w-sm flex-col gap-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  className="flex items-center gap-3 text-sm font-medium text-foreground"
                  htmlFor={allowMentionsSwitchId}
                >
                  <input
                    {...register('allowMentions')}
                    id={allowMentionsSwitchId}
                    type="checkbox"
                    className="peer sr-only"
                    disabled={disablePreferencesFields}
                    data-testid="mentions-preferences-toggle"
                  />
                  <span className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition peer-checked:border-primary peer-checked:bg-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                    <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
                  </span>
                  Allow mention notifications
                </label>
                <p className="text-xs text-muted-foreground">
                  {allowMentions
                    ? 'Receive alerts when teammates mention you. Turn this off to silence mention notifications.'
                    : 'Mentions will stop sending alerts, but you can still find them in the notifications list.'}
                </p>
              </div>
              <div className="space-y-2">
                <label
                  className="flex items-center gap-3 text-sm font-medium text-foreground"
                  htmlFor={digestEnabledSwitchId}
                >
                  <input
                    {...register('digestEnabled')}
                    id={digestEnabledSwitchId}
                    type="checkbox"
                    className="peer sr-only"
                    disabled={disablePreferencesFields}
                    data-testid="digest-preferences-toggle"
                  />
                  <span className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition peer-checked:border-primary peer-checked:bg-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                    <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
                  </span>
                  Enable daily digest
                </label>
                <p className="text-xs text-muted-foreground">
                  {digestEnabled
                    ? `We'll send a summary around ${formatDigestHour(digestHourUtc)} UTC.`
                    : 'Turn this on to receive a once-per-day email summary of mentions.'}
                </p>
              </div>
              <div className="space-y-1">
                <label
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  htmlFor={digestHourSelectId}
                >
                  Digest delivery time (UTC)
                </label>
                <select
                  {...register('digestHourUtc', { valueAsNumber: true })}
                  id={digestHourSelectId}
                  className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="digest-hour-select"
                  disabled={disablePreferencesFields || !digestEnabled}
                >
                  {DIGEST_HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {formatDigestHour(hour)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {digestEnabled
                    ? 'Choose when the digest arrives in UTC.'
                    : 'Enable the digest to pick a delivery time.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!hasPreferenceChanges || disablePreferencesFields}
              >
                {updatePreferencesMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasPreferenceChanges || updatePreferencesMutation.isPending}
                onClick={handleResetPreferences}
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
        </form>
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
