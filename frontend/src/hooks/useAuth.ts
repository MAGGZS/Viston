'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { AuthTokens } from '@/types';

export function useAuth() {
  const router = useRouter();
  const { user, setAuth, logout: clearAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<AuthTokens>('/auth/login', data).then((r) => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      // Salva em cookie para o middleware conseguir ler
      document.cookie = `accessToken=${data.accessToken}; path=/; max-age=900`;
      document.cookie = `userRole=${data.user.role}; path=/; max-age=604800`;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      router.push('/home');
    },
  });

  const logout = () => {
    clearAuth();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    document.cookie = 'accessToken=; path=/; max-age=0';
    document.cookie = 'userRole=; path=/; max-age=0';
    router.push('/login');
  };

  return { user, loginMutation, logout };
}
