import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { countUnreadNotifications } from '../utils';
import type { NotificationItem } from '../types';
import { NOTIFICATIONS_PAGE_SIZE, notificationsQueryKey } from './useNotificationsQuery';
import { useNotificationsSubscription } from './useNotificationsSubscription';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: NotificationItem['payload'] | null;
  read_at: string | null;
  created_at: string;
};

type ListenerPayload = {
  eventType: string;
  new: NotificationRow | null;
  old: NotificationRow | null;
};

type Listener = (payload: ListenerPayload) => void;

type ChannelMock = {
  on: Mock;
  subscribe: Mock<[], ChannelMock>;
  unsubscribe: Mock<[], Promise<string>>;
};

const {
  channelFactory,
  channelMock,
  listeners,
  unsubscribeMock,
} = vi.hoisted(() => {
  const listeners: Listener[] = [];
  const unsubscribeMock = vi.fn<[], Promise<string>>(async () => 'ok');
  const channelMock: ChannelMock = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: unsubscribeMock,
  };

  channelMock.on.mockImplementation((_event: string, _config: unknown, callback: Listener) => {
    listeners.push(callback);
    return channelMock;
  });

  channelMock.subscribe.mockImplementation(() => channelMock);

  const channelFactory = vi.fn<[], ChannelMock>(() => channelMock);

  return {
    channelFactory,
    channelMock,
    listeners,
    unsubscribeMock,
  };
}) as {
  channelFactory: Mock<[], ChannelMock>;
  channelMock: ChannelMock;
  listeners: Listener[];
  unsubscribeMock: Mock<[], Promise<string>>;
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: channelFactory,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  listeners.length = 0;
});

const USER_ID = '11111111-1111-4111-8111-111111111111';

const createQueryClient = () => new QueryClient();

const Wrapper = ({ client, children }: { client: QueryClient; children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const TestComponent = ({ userId }: { userId: string | null }) => {
  useNotificationsSubscription(userId);
  return null;
};

describe('useNotificationsQuery realtime bridge', () => {
  describe('useNotificationsSubscription', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      listeners.length = 0;
    });

    it('subscribes to realtime changes and appends new notifications to the first page', async () => {
    const queryClient = createQueryClient();
    const existingNotification: NotificationItem = {
      id: 'existing-id',
      type: 'mention',
      payload: {},
      read_at: '2024-01-01T00:00:00.000Z',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    const queryKey = notificationsQueryKey(USER_ID);

    queryClient.setQueryData<InfiniteData<NotificationItem[], number>>(queryKey, {
      pageParams: [0],
      pages: [[existingNotification]],
    });

    render(
      <Wrapper client={queryClient}>
        <TestComponent userId={USER_ID} />
      </Wrapper>,
    );

    expect(channelFactory).toHaveBeenCalledWith(`notifications:user:${USER_ID}`);
    expect(channelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ filter: `user_id=eq.${USER_ID}` }),
      expect.any(Function),
    );

    const payload: NotificationRow = {
      id: 'new-id',
      user_id: USER_ID,
      type: 'comment',
      payload: { title: 'New notification' },
      read_at: null,
      created_at: '2024-02-01T00:00:00.000Z',
    };

    await act(async () => {
      listeners.forEach((listener) =>
        listener({ eventType: 'INSERT', new: payload, old: null }),
      );
    });

    const data = queryClient.getQueryData<InfiniteData<NotificationItem[], number>>(queryKey);
    expect(data?.pages[0][0]).toMatchObject({ id: 'new-id', read_at: null });
    const unreadCount = countUnreadNotifications(data?.pages.flat() ?? []);
    expect(unreadCount).toBe(1);
  });

    it('updates the cached notification when a realtime update is received', async () => {
    const queryClient = createQueryClient();
    const existingNotification: NotificationItem = {
      id: 'existing-id',
      type: 'comment',
      payload: {},
      read_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
    };

    const queryKey = notificationsQueryKey(USER_ID);

    queryClient.setQueryData<InfiniteData<NotificationItem[], number>>(queryKey, {
      pageParams: [0],
      pages: [[existingNotification]],
    });

    render(
      <Wrapper client={queryClient}>
        <TestComponent userId={USER_ID} />
      </Wrapper>,
    );

    const payload: NotificationRow = {
      ...existingNotification,
      user_id: USER_ID,
      read_at: '2024-02-01T00:00:00.000Z',
    };

    await act(async () => {
      listeners.forEach((listener) =>
        listener({ eventType: 'UPDATE', new: payload, old: null }),
      );
    });

    const data = queryClient.getQueryData<InfiniteData<NotificationItem[], number>>(queryKey);
    expect(data?.pages[0][0]).toMatchObject({ id: 'existing-id', read_at: '2024-02-01T00:00:00.000Z' });
  });

    it('removes notifications from the cache on delete events', async () => {
    const queryClient = createQueryClient();
    const notifications: NotificationItem[] = Array.from({ length: NOTIFICATIONS_PAGE_SIZE }, (_, index) => ({
      id: `notification-${index}`,
      type: 'comment',
      payload: {},
      read_at: null,
      created_at: `2024-01-0${index + 1}T00:00:00.000Z`,
    }));

    const queryKey = notificationsQueryKey(USER_ID);

    queryClient.setQueryData<InfiniteData<NotificationItem[], number>>(queryKey, {
      pageParams: [0],
      pages: [notifications],
    });

    render(
      <Wrapper client={queryClient}>
        <TestComponent userId={USER_ID} />
      </Wrapper>,
    );

    await act(async () => {
      listeners.forEach((listener) =>
        listener({
          eventType: 'DELETE',
          new: null,
          old: {
            id: 'notification-0',
            user_id: USER_ID,
            type: 'comment',
            payload: {},
            read_at: null,
            created_at: '2024-01-01T00:00:00.000Z',
          },
        }),
      );
    });

    const data = queryClient.getQueryData<InfiniteData<NotificationItem[], number>>(queryKey);
    expect(data?.pages[0].some((item) => item.id === 'notification-0')).toBe(false);
  });

    it('unsubscribes when the component is unmounted', () => {
    const queryClient = createQueryClient();
    const queryKey = notificationsQueryKey(USER_ID);

    queryClient.setQueryData<InfiniteData<NotificationItem[], number>>(queryKey, {
      pageParams: [0],
      pages: [[]],
    });

    const { unmount } = render(
      <Wrapper client={queryClient}>
        <TestComponent userId={USER_ID} />
      </Wrapper>,
    );

    expect(unsubscribeMock).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });

    it('does not subscribe when the user id is null', () => {
    const queryClient = createQueryClient();

    render(
      <Wrapper client={queryClient}>
        <TestComponent userId={null} />
      </Wrapper>,
    );

    expect(channelFactory).not.toHaveBeenCalled();
  });
  });
});
