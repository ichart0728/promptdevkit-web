import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { NotificationsMenu } from './NotificationsMenu';
import type { NotificationItem } from '@/domains/notifications/types';
import { router } from '@/app/router';
import { useNotificationReadMutation } from '@/domains/notifications/hooks/useNotificationReadMutation';
import { useNotificationsQuery } from '@/domains/notifications/hooks/useNotificationsQuery';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@/domains/notifications/hooks/useNotificationsQuery');
vi.mock('@/domains/notifications/hooks/useNotificationReadMutation');
vi.mock('@/components/common/toast', () => ({ toast: vi.fn() }));

const mockedUseNotificationsQuery = vi.mocked(useNotificationsQuery);
const mockedUseNotificationReadMutation = vi.mocked(useNotificationReadMutation);

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

const renderMenu = () => render(<NotificationsMenu userId="11111111-1111-4111-8111-111111111111" />);

describe('NotificationsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseNotificationsQuery.mockReturnValue(createQueryResult());
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult());
    vi.spyOn(router, 'navigate').mockResolvedValue(
      undefined as Awaited<ReturnType<typeof router.navigate>>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a notifications button without a badge when there are no unread notifications', () => {
    const notification = createNotification({ read_at: '2024-01-20T11:00:00.000Z' });
    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[notification]], pageParams: [0] } }),
    );

    renderMenu();

    const button = screen.getByRole('button', { name: 'Notifications' });

    expect(button).toBeInTheDocument();
    expect(within(button).queryByText('1')).not.toBeInTheDocument();
  });

  it('shows an unread badge when unread notifications exist', () => {
    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );

    renderMenu();

    expect(screen.getByRole('button', { name: '1 unread notifications' })).toBeInTheDocument();
  });

  it('allows toggling the read state of a notification', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult({ mutate }));

    renderMenu();

    await user.click(screen.getByRole('button', { name: '1 unread notifications' }));
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));

    expect(mutate).toHaveBeenCalledWith({ id: 'notification-1', read: true });
  });

  it('marks all notifications as read from the menu', async () => {
    const user = userEvent.setup();
    const mutateAll = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult({ mutateAll }));

    renderMenu();

    await user.click(screen.getByRole('button', { name: '1 unread notifications' }));
    await user.click(screen.getByRole('button', { name: 'Mark all' }));

    expect(mutateAll).toHaveBeenCalled();
  });

  it('provides a link to the notifications page', async () => {
    const user = userEvent.setup();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({ data: { pages: [[createNotification()]], pageParams: [0] } }),
    );

    renderMenu();

    await user.click(screen.getByRole('button', { name: '1 unread notifications' }));

    await user.click(screen.getByRole('button', { name: 'View all' }));

    expect(router.navigate).toHaveBeenCalledWith({ to: '/notifications' });
  });

  it('navigates to a prompt when clicking the mention CTA', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();

    mockedUseNotificationsQuery.mockReturnValue(
      createQueryResult({
        data: {
          pages: [
            [
              createNotification({
                id: 'mention-1',
                type: 'mention',
                payload: {
                  title: 'New mention',
                  message: 'You were mentioned',
                  prompt_id: 'prompt-42',
                  thread_id: 'thread-9',
                  comment_id: 'comment-33',
                } as NotificationItem['payload'],
              }),
            ],
          ],
          pageParams: [0],
        },
      }),
    );
    mockedUseNotificationReadMutation.mockReturnValue(createMutationResult({ mutate }));

    renderMenu();

    await user.click(screen.getByRole('button', { name: '1 unread notifications' }));
    await user.click(screen.getByRole('button', { name: 'Go to discussion' }));

    expect(router.navigate).toHaveBeenCalledWith({
      to: '/prompts',
      search: { promptId: 'prompt-42', threadId: 'thread-9', commentId: 'comment-33' },
    });
    expect(mutate).toHaveBeenCalledWith({ id: 'mention-1', read: true });
  });
});
