'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import { Spinner } from '@/app/components/ui';

export function RouteGuard({ children, roles = [] }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (roles.length > 0 && !roles.includes(user.role)) {
      router.replace('/');
    }
  }, [user, isLoading, roles]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;
  if (roles.length > 0 && !roles.includes(user.role)) return null;

  return children;
}
