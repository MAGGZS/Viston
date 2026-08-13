'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/app/store/auth';
import api from '@/app/lib/api';

export function AuthProvider({ children }) {
  // Ações do zustand têm referência estável, então listá-las nas dependências
  // não faz o efeito rodar de novo.
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    // `/auth/me` e não `/users/me`: no carregamento só existe o token, e é ele
    // que diz em qual das duas tabelas a conta mora. A resposta vem com `kind`.
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [setUser, setLoading, logout]);

  return children;
}
