import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      updateUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'viston-auth' }
  )
);
