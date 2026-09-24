'use client';
import { create } from 'zustand';

/**
 * Store global do Modal de Sugestão de Upgrade.
 *
 * É acionada sempre que uma ação de gestor atinge um limite ou exige um recurso
 * exclusivo de planos superiores, substituindo avisos de erro em toast por uma
 * apresentação comercial amigável com CTA direto de upgrade.
 */
export const useUpgradeModalStore = create((set) => ({
  isOpen: false,
  errorData: null,

  open: ({
    title,
    message,
    code = 'LIMITE_DO_PLANO',
    limit,
    current,
    currentPlan = 'LIVRE',
    targetPlan,
    feature,
  } = {}) => {
    const recommended = targetPlan || (currentPlan === 'ESSENCIAL' ? 'PRO' : 'ESSENCIAL');
    set({
      isOpen: true,
      errorData: {
        title,
        message,
        code,
        limit,
        current,
        currentPlan,
        targetPlan: recommended,
        feature,
      },
    });
  },

  openFromError: (err, fallbackMessage = 'Limite do plano atingido') => {
    const errorObj = err?.response?.data?.error;
    const code = errorObj?.code || 'LIMITE_DO_PLANO';
    const message = errorObj?.message || fallbackMessage;
    const details = errorObj?.details || {};

    const currentPlan = details.plan || 'LIVRE';
    const targetPlan = currentPlan === 'ESSENCIAL' ? 'PRO' : 'ESSENCIAL';

    set({
      isOpen: true,
      errorData: {
        code,
        message,
        limit: details.limit,
        current: details.current,
        currentPlan,
        targetPlan,
        feature: details.feature,
      },
    });
  },

  close: () => set({ isOpen: false, errorData: null }),
}));
