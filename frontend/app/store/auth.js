'use client';
import { create } from 'zustand';
import api from '@/app/lib/api';
import { clearTokens, setTokens } from '@/app/lib/session';

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  login: (accessToken, refreshToken, user) => {
    setTokens(accessToken, refreshToken);
    set({ user });
  },

  /**
   * Esquece a sessão só deste aparelho.
   *
   * É o que se usa quando o servidor já não reconhece o token (o `/auth/me` que
   * volta 401 no carregamento): pedir para sair ali seria pedir com uma
   * credencial que não vale mais.
   */
  clearSession: () => {
    clearTokens();
    set({ user: null, isLoading: false });
  },

  /**
   * Sair de verdade: o servidor encerra as sessões da conta e só então os
   * tokens saem daqui.
   *
   * Sem a ida ao servidor, sair era apagar o token do próprio navegador — o
   * refresh token continuava aceito por sete dias em qualquer lugar onde já
   * estivesse. A falha da chamada não segura ninguém na tela: se a rede caiu,
   * a sessão local sai do mesmo jeito e o servidor cobra a geração na próxima
   * renovação.
   */
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Sair não pode falhar do lado de cá.
    }
    clearTokens();
    set({ user: null, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
