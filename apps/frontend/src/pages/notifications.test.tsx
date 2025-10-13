import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

import type { NotificationItem } from '@/domains/notifications/types';
import { useSessionQuery } from '@/domains/auth/hooks/useSessionQuery';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { router } from '@/app/router';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
    })),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

vi.mock('@/domains/auth/hooks/useSessionQuery');
vi.mock('@/domains/notifications/hooks/useNotificationsQuery');
vi.mock('@/domains/notifications/hooks/useNotificationReadMutation');
vi.mock('@/components/common/toast', () => ({ toast: vi.fn() }));

import { NotificationsPage } from './notifications';

const mockedUseSessionQuery = vi.mocked(useSessionQuery);
const mockedUseNotificationsQuery = vi.mocked(useNotificationsQuery);
const mockedUseNotificationReadMutation = vi.mocked(useNotificationReadMutation);

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    mockObservers.push(this);
  }

  observe(element: Element) {
    this.elements.push(element);
  }

  unobserve() {}

  disconnect() {}

  trigger(isIntersecting: boolean) {
    this.callback(
      this.elements.map((target) => ({
        isIntersecting,
        target,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: target.getBoundingClientRect(),
        isVisible: isIntersecting,
        rootBounds: null,
        time: Date.now(),
      })),
      this as unknown as IntersectionObserver,
    );
  }
}

const mockObservers: MockIntersectionObserver[] = [];

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
});

afterEach(() => {
  cleanup();
  mockObservers.length = 0;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const renderNotificationsPage = () => {
  const queryClient = createTestQueryClient();
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPage />
    </QueryClientProvider>,
  );

  return { ...renderResult, queryClient };
};

const createNotification = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'notification-1',
  type: 'system',
  payload: { title: 'System update', message: 'We shipped new features.' },
  read_at: null,
  created_at: '2024-01-20T10:00:00.000Z',
  ...overrides,
});

const createQueryResult = (
  overrides: Partial<ReturnType<typeof useNotificationsQuery>> = {},
): ReturnType<typeof useNotificationsQuery> =>
  ({
    data: { pages: [[]], pageParams: [0] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useNotificationsQuery>);

const createMutationResult = (
  overrides: Partial<ReturnType<typeof useNotificationReadMutation>> = {},
): ReturnType<typeof useNotificationReadMutation> =>
  ({
    mutate: vi.fn(),
    mutateAll: vi.fn(),
    isPending: false,
    isMutatingAll: false,
    markAllError: null,
    ...overrides,
  } as unknown as ReturnType<typeof useNotificationReadMutation>);

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseSessionQuery.mockReturnValue({
      data: { user: { id: 'user-1', email: 'demo@example.com' } },
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);
    mockedUseNotificationsQuery.mockReturnValue(createQueryResult());
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult());
    vi.spyOn(router, 'navigate').mockResolvedValue(
      undefined as Awaited<ReturnType<typeof router.navigate>>,
    );
  });

  it('renders a loading state while the session is fetching', () => {
    mockedUseSessionQuery.mockReturnValue({
      data: null,
      isPending: true,
    } as unknown as ReturnType<typeof useSessionQuery>);

    renderNotificationsPage();

    expect(screen.getByText('Loading your session…')).toBeInTheDocument();
  });

  it('asks the user to sign in when there is no session', () => {
    mockedUseSessionQuery.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof useSessionQuery>);

    renderNotificationsPage();

    expect(screen.getByText('Sign in to view your notifications.')).toBeInTheDocument();
  });

  it('renders notifications and allows marking them all as read', async () => {
    const user = userEvent.setup();
    const mutateAll = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult({ mutateAll }));

    renderNotificationsPage();

    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(mutateAll).toHaveBeenCalledTimes(1);
  });

  it('fetches the next page when the sentinel enters the viewport', async () => {
    const fetchNextPage = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({
        data: { pages: [[createNotification()]], pageParams: [0] },
        hasNextPage: true,
        fetchNextPage,
      }),
    );

    renderNotificationsPage();

    await act(async () => {
      mockObservers.forEach((observer) => observer.trigger(true));
    });

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('matches the snapshot for the notifications list', () => {
    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );

    const { asFragment } = renderNotificationsPage();

    expect(asFragment()).toMatchSnapshot();
  });

  it('navigates to the prompt when clicking the mention CTA', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({
        data: {
          pages: [
            [
              createNotification({
                id: 'mention-2',
                type: 'mention',
                payload: {
                  title: 'Mentioned in prompt',
                  message: 'Join the discussion',
                  prompt_id: 'prompt-7',
                  thread_id: 'thread-3',
                } as NotificationItem['payload'],
              }),
            ],
          ],
          pageParams: [0],
        },
      }),
    );
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult({ mutate }));

    renderNotificationsPage();

    await user.click(screen.getByRole('button', { name: 'Go to discussion' }));

    expect(router.navigate).toHaveBeenCalledWith({
      to: '/prompts',
      search: { promptId: 'prompt-7', threadId: 'thread-3' },
    });
    expect(mutate).toHaveBeenCalledWith({ id: 'mention-2', read: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
