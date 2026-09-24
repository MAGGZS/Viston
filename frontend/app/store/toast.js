'use client';
import { create } from 'zustand';
import { useUpgradeModalStore } from '@/app/store/upgradeModal';

let nextId = 0;

const PLAN_CODES = ['LIMITE_DO_PLANO', 'RECURSO_DO_PLANO', 'PREDIO_CONGELADO'];

export const useToastStore = create((set) => ({
  toasts: [],
  show: (message, type = 'success', detail = null) => {
    // Se for erro de restrição de plano, abre o modal de upgrade e suprime o toast
    const errorCode = detail?.response?.data?.error?.code;
    if (errorCode && PLAN_CODES.includes(errorCode)) {
      useUpgradeModalStore.getState().openFromError(detail, message);
      return;
    }

    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, detail }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
