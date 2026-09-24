import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUpgradeModalStore } from '@/app/store/upgradeModal';
import { useToastStore } from '@/app/store/toast';
import { avisarErro, ehErroDePlano } from '@/app/lib/erros';
import { UpgradeModal } from '@/app/components/UpgradeModal';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  usePathname: () => '/gestor',
  useSearchParams: () => new URLSearchParams(),
}));

function planError(code, message, details = {}) {
  return {
    response: {
      status: 403,
      data: {
        error: { code, message, details },
      },
    },
  };
}

describe('Modal de Sugestão de Upgrade', () => {
  beforeEach(() => {
    useUpgradeModalStore.setState({ isOpen: false, errorData: null });
    useToastStore.setState({ toasts: [] });
    pushMock.mockClear();
  });

  it('identifica corretamente erros de plano', () => {
    expect(ehErroDePlano(planError('LIMITE_DO_PLANO', 'Limite atingido'))).toBe(true);
    expect(ehErroDePlano(planError('RECURSO_DO_PLANO', 'Recurso bloqueado'))).toBe(true);
    expect(ehErroDePlano(planError('PREDIO_CONGELADO', 'Prédio inativo'))).toBe(true);
    expect(ehErroDePlano(planError('VALIDATION_ERROR', 'Campo inválido'))).toBe(false);
  });

  it('avisarErro abre o modal de upgrade e não dispara toast para erro de plano', () => {
    const toastMock = jest.fn();
    const err = planError('LIMITE_DO_PLANO', 'Seu plano comporta 1 prédio.', {
      limit: 1,
      current: 1,
      plan: 'LIVRE',
    });

    avisarErro(toastMock, err);

    expect(toastMock).not.toHaveBeenCalled();
    const state = useUpgradeModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.errorData.message).toBe('Seu plano comporta 1 prédio.');
    expect(state.errorData.targetPlan).toBe('ESSENCIAL');
  });

  it('useToastStore suprime toasts que carregam detalhes de erro de plano', () => {
    const err = planError('LIMITE_DO_PLANO', 'Seu plano comporta 1 prédio.');
    useToastStore.getState().show('Seu plano comporta 1 prédio.', 'error', err);

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useUpgradeModalStore.getState().isOpen).toBe(true);
  });

  it('renderiza o modal com plano sugerido, benefícios e botão de upgrade', async () => {
    const user = userEvent.setup();
    useUpgradeModalStore.getState().openFromError(
      planError('LIMITE_DO_PLANO', 'Seu plano comporta 1 prédio.', {
        limit: 1,
        current: 1,
        plan: 'LIVRE',
      })
    );

    render(<UpgradeModal />);

    expect(screen.getByText('Precisa de mais prédios?')).toBeInTheDocument();
    expect(screen.getByText(/Plano Essencial/i)).toBeInTheDocument();
    expect(screen.getByText(/Até 3 prédios cadastrados/i)).toBeInTheDocument();

    const upgradeBtn = screen.getByRole('button', { name: /Ver planos e fazer upgrade/i });
    expect(upgradeBtn).toBeInTheDocument();

    await user.click(upgradeBtn);
    expect(pushMock).toHaveBeenCalledWith('/gestor/cobranca');
    expect(useUpgradeModalStore.getState().isOpen).toBe(false);
  });
});
