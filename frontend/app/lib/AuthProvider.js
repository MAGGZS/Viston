'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/auth';
import api from '@/app/lib/api';
import { getAccessToken, SESSION_EXPIRED } from '@/app/lib/session';

export function AuthProvider({ children }) {
  // Ações do zustand têm referência estável, então listá-las nas dependências
  // não faz o efeito rodar de novo.
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const clearSession = useAuthStore((s) => s.clearSession);
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // `/auth/me` e não `/users/me`: no carregamento só existe o token, e é ele
    // que diz em qual das duas tabelas a conta mora. A resposta vem com `kind`.
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data))
      // `clearSession` e não `logout`: o token já não vale, então não há a quem
      // pedir para sair — só o que apagar daqui.
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, [setUser, setLoading, clearSession]);

  /**
   * A sessão expirou no meio do uso (o interceptor não conseguiu renovar).
   *
   * A volta ao login passa pelo router, e não por `window.location`: recarregar
   * a página joga fora o cache das consultas e o estado das telas, e o usuário
   * espera o app inteiro subir de novo para ver um formulário.
   */
  useEffect(() => {
    function onExpired() {
      clearSession();
      router.replace('/login');
    }
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, [clearSession, router]);

  return children;
}
