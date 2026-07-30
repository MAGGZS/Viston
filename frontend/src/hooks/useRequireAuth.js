'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export function useRequireAuth(requiredRoles = []) {
  const router = useRouter();
  const { token, user } = useAuthStore();

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    if (requiredRoles.length && !requiredRoles.includes(user?.role)) {
      router.replace('/home');
    }
  }, [token, user, router, requiredRoles]);

  return { user, isLoading: !user };
}
