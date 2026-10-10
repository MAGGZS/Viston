import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import GestorColaboradoresPage from '@/app/gestor/predios/[id]/colaboradores/page';

/**
 * Aprovar um pedido de acesso, na aba de colaboradores do gestor.
 *
 * Antes, "Aprovar" aprovava direto como visualizador, e quem tinha pedido pelo
 * celular ficava sem nada para fazer. Agora "Aprovar" abre a escolha de papel,
 * e o pedido só sai com o papel que o gestor marcou. Recusar continua direto,
 * sem papel.
 */

const mockReview = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../components/GestorShell', () => ({
  GestorShell: ({ actions, children }) => (
    <main>
      {actions}
      {children}
    </main>
  ),
}));

jest.mock('../components/TrocaDeDono', () => ({ TrocaDeDono: () => null }));

jest.mock('../hooks/useApi', () => ({
  useBuildingMembers: () => ({
    data: {
      managers: [],
      members: [],
      owner_manager_id: 'g1',
      role_capacity: {
        INSPECTOR: { allowed: false, code: 'LIMITE_DO_PLANO', reason: 'O plano deste prédio comporta 1 inspetor por prédio.' },
        VIEWER: { allowed: true, code: null, reason: null },
        RESPONSAVEL: { allowed: true, code: null, reason: null },
        MODERADOR: { allowed: false, code: 'RECURSO_DO_PLANO', reason: 'O plano deste prédio não inclui moderadores.' },
      },
    },
    isLoading: false,
  }),
  useAccessRequests: () => ({
    data: [
      { id: 'r1', requested_at: '2026-10-01T12:00:00Z', user: { name: 'Ana Souza', email: 'ana@exemplo.com' } },
    ],
    isLoading: false,
  }),
  useReviewAccessRequest: () => ({ mutateAsync: mockReview, isPending: false }),
  useRemoveMember: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateMemberRole: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddBuildingManager: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRemoveBuildingManager: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

beforeEach(() => {
  mockReview.mockReset();
  mockReview.mockResolvedValue({});
});

async function abrirSolicitacoes() {
  render(<GestorColaboradoresPage />);
  await userEvent.click(screen.getByRole('button', { name: /solicitações/i }));
  return screen.getByRole('dialog');
}

describe('aprovar pedido de acesso escolhendo o papel', () => {
  it('"Aprovar" abre a escolha de papel, sem aprovar ainda', async () => {
    const caixa = await abrirSolicitacoes();

    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar ana souza/i }));

    expect(mockReview).not.toHaveBeenCalled();
    expect(within(caixa).getByText(/qual será o papel de/i)).toBeInTheDocument();
    expect(within(caixa).getByRole('radio', { name: 'Visualizador' })).toHaveAccessibleDescription(
      /somente pelo computador/i
    );
    // Sem vaga: desabilitado e com o motivo à vista, antes de qualquer clique.
    expect(within(caixa).getByRole('radio', { name: 'Inspetor' })).toBeDisabled();
    expect(within(caixa).getByText(/comporta 1 inspetor por prédio/i)).toBeVisible();
  });

  it('aprova com o papel escolhido', async () => {
    const caixa = await abrirSolicitacoes();

    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar ana souza/i }));
    await userEvent.click(within(caixa).getByRole('radio', { name: 'Responsável' }));
    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar como responsável/i }));

    expect(mockReview).toHaveBeenCalledWith({
      buildingId: 'p1',
      requestId: 'r1',
      status: 'APPROVED',
      role: 'RESPONSAVEL',
    });
  });

  it('recusar continua direto e sem papel', async () => {
    const caixa = await abrirSolicitacoes();

    await userEvent.click(within(caixa).getByRole('button', { name: /rejeitar ana souza/i }));

    expect(mockReview).toHaveBeenCalledWith({ buildingId: 'p1', requestId: 'r1', status: 'REJECTED' });
  });

  it('quando o servidor recusa, a frase dele aparece junto das opções', async () => {
    mockReview.mockRejectedValue({
      response: {
        data: { error: { code: 'LIMITE_DO_PLANO', message: 'O plano deste prédio comporta 1 visualizador por prédio.' } },
      },
    });
    const caixa = await abrirSolicitacoes();

    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar ana souza/i }));
    await userEvent.click(within(caixa).getByRole('radio', { name: 'Visualizador' }));
    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar como visualizador/i }));

    expect(await within(caixa).findByRole('alert')).toHaveTextContent(/1 visualizador por prédio/);
  });

  it('a escolha de papel não tem violações de acessibilidade', async () => {
    const caixa = await abrirSolicitacoes();
    await userEvent.click(within(caixa).getByRole('button', { name: /aprovar ana souza/i }));

    expect(await axe(caixa)).toHaveNoViolations();
  });
});
