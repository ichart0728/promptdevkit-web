import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { Session } from '@supabase/supabase-js';

import { AuthMenu } from './AuthMenu';
import { useSessionQuery } from '../hooks/useSessionQuery';
import { useSignOutMutation } from '../hooks/useSignOutMutation';

vi.mock('@/components/common/NotificationsMenu', () => ({
  NotificationsMenu: () => <div data-testid="notifications-menu" />,
}));

vi.mock('../hooks/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));
vi.mock('../hooks/useSignOutMutation', () => ({
  useSignOutMutation: vi.fn(),
}));
vi.mock('./SignInForm', () => ({
  SignInForm: () => <div data-testid="sign-in-form" />,
}));

const useSessionQueryMock = vi.mocked(useSessionQuery);
const useSignOutMutationMock = vi.mocked(useSignOutMutation);

const buildSessionQueryValue = (
  overrides: Partial<ReturnType<typeof useSessionQuery>> = {},
): ReturnType<typeof useSessionQuery> =>
  ({
    data: null,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useSessionQuery>);

const buildSignOutMutationValue = (
  overrides: Partial<ReturnType<typeof useSignOutMutation>> = {},
): ReturnType<typeof useSignOutMutation> =>
  ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useSignOutMutation>);

beforeEach(() => {
  vi.clearAllMocks();
  useSessionQueryMock.mockReturnValue(buildSessionQueryValue());
  useSignOutMutationMock.mockReturnValue(buildSignOutMutationValue());
});

describe('AuthMenu', () => {
  it('renders a sign in button when no session exists', () => {
    render(<AuthMenu />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows the user email and sign out button when a session exists', () => {
    const session = {
      user: { email: 'team@example.com' },
    } as unknown as Session;
    useSessionQueryMock.mockReturnValue(
      buildSessionQueryValue({
        data: session,
      }),
    );

    render(<AuthMenu />);

    expect(screen.getByTestId('notifications-menu')).toBeInTheDocument();
    expect(screen.getByText('team@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls sign out mutation when the sign out button is clicked', async () => {
    const user = userEvent.setup();
    const mutateMock = vi.fn();
    const session = {
      user: { email: 'team@example.com' },
    } as unknown as Session;
    useSessionQueryMock.mockReturnValue(
      buildSessionQueryValue({
        data: session,
      }),
    );
    useSignOutMutationMock.mockReturnValue(
      buildSignOutMutationValue({
        mutate: mutateMock,
      }),
    );

    render(<AuthMenu />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mutateMock).toHaveBeenCalled();
  });

  it('displays an error message when sign out fails', () => {
    const session = {
      user: { email: 'team@example.com' },
    } as unknown as Session;
    useSessionQueryMock.mockReturnValue(
      buildSessionQueryValue({
        data: session,
      }),
    );
    useSignOutMutationMock.mockReturnValue(
      buildSignOutMutationValue({
        error: new Error('Failed to sign out'),
      }),
    );

    render(<AuthMenu />);

    expect(screen.getByText('Failed to sign out')).toBeInTheDocument();
  });
});
