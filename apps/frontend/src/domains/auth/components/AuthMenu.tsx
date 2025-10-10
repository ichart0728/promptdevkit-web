import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { useSessionQuery } from '../hooks/useSessionQuery';
import { useSignOutMutation } from '../hooks/useSignOutMutation';
import { SignInForm } from './SignInForm';

export const AuthMenu = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: session, isPending } = useSessionQuery();
  const signOutMutation = useSignOutMutation();

  if (isPending) {
    return (
      <Button disabled size="sm" variant="ghost">
        Loading…
      </Button>
    );
  }

  if (session) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {session.user?.email ? (
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
          ) : null}
          <Button
            disabled={signOutMutation.isPending}
            onClick={() => signOutMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {signOutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
        {signOutMutation.error ? (
          <span className="text-xs text-destructive" role="alert">
            {signOutMutation.error.message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Sign in</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in</DialogTitle>
          <DialogDescription>Use your email and password to access PromptDevKit.</DialogDescription>
        </DialogHeader>
        <SignInForm onSuccess={() => setIsDialogOpen(false)} />
      </DialogContent>
    </Dialog>
  );
};
