'use client';

import { BottomNav } from '@/components/BottomNav';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Spinner } from '@/components/ui';

export default function AppLayout({ children }) {
  const { isLoading } = useRequireAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <main className="pb-20 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
