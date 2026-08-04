'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/app/store/auth';
import api from '@/app/lib/api';

export function AuthProvider({ children }) {
  const { setUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/users/me')
      .then(({ data }) => setUser(data))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  return children;
}
