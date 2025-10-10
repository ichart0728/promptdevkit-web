import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useSignInWithPasswordMutation } from '../hooks/useSignInWithPasswordMutation';

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

type SignInFormProps = {
  onSuccess?: () => void;
};

export const SignInForm = ({ onSuccess }: SignInFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signInMutation = useSignInWithPasswordMutation({
    onSuccess: () => {
      setFormError(null);
      form.reset();
      onSuccess?.();
    },
  });

  const onSubmit: SubmitHandler<SignInFormValues> = async (values) => {
    setFormError(null);

    try {
      await signInMutation.mutateAsync(values);
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError('Failed to sign in.');
      }
    }
  };

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = form;

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input autoComplete="email" id="email" placeholder="you@example.com" type="email" {...register('email')} />
        {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <Input autoComplete="current-password" id="password" type="password" {...register('password')} />
        {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
      </div>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <Button className="w-full" disabled={signInMutation.isPending} type="submit">
        {signInMutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
};
