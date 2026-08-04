'use client';
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  login: (accessToken, refreshToken, user) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    set({ user: null, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
