import type { Session } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { SignInForm, type SignInFormValues } from './SignInForm';
import { useSignInWithPasswordMutation } from '../hooks/useSignInWithPasswordMutation';

type UseSignInMutationReturn = ReturnType<typeof useSignInWithPasswordMutation>;

vi.mock('../hooks/useSignInWithPasswordMutation', () => ({
  useSignInWithPasswordMutation: vi.fn(),
}));

const useSignInWithPasswordMutationMock = vi.mocked(useSignInWithPasswordMutation);
const mutateAsyncMock = vi.fn<[SignInFormValues], Promise<Session | null>>();

const createMutationMock = (): UseSignInMutationReturn =>
  ({
    mutateAsync: mutateAsyncMock as unknown as UseSignInMutationReturn['mutateAsync'],
    mutate: vi.fn(),
    isPending: false,
  } as unknown as UseSignInMutationReturn);

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsyncMock.mockReset();
  mutateAsyncMock.mockResolvedValue(null);
  useSignInWithPasswordMutationMock.mockReturnValue(createMutationMock());
});

describe('SignInForm', () => {
  it('submits credentials when form is valid', async () => {
    const user = userEvent.setup();

    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('shows validation errors when fields are empty', async () => {
    const user = userEvent.setup();

    render(<SignInForm />);

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 6 characters long/i)).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('displays an error message when sign-in fails', async () => {
    const user = userEvent.setup();
    mutateAsyncMock.mockRejectedValueOnce(new Error('Invalid credentials'));

    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
