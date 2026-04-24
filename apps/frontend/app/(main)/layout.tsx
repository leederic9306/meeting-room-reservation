import type { ReactNode } from 'react';

import { AppHeader } from '@/components/features/auth/AppHeader';

export default function MainLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <AppHeader />
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
