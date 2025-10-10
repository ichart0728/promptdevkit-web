import { Link, Outlet, useRouterState } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { AuthMenu } from '@/domains/auth/components/AuthMenu';

const navigation = [
  { to: '/', label: 'Dashboard' },
  { to: '/prompts', label: 'Prompts' },
  { to: '/teams', label: 'Teams' },
];

export const RootLayout = () => {
  const { location } = useRouterState();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex items-center justify-between py-4">
          <Link className="text-lg font-semibold" to="/">
            PromptDevKit
          </Link>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Button
                    key={item.to}
                    asChild
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                  >
                    <Link to={item.to}>{item.label}</Link>
                  </Button>
                );
              })}
            </nav>
            <AuthMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
