import { render, screen } from '@testing-library/react';
import { VisualizadorSidebar, itensDoVisualizador } from '@/app/components/VisualizadorSidebar';
import { GestorSidebar, itemsFor } from '@/app/components/GestorSidebar';
import { SIDEBAR_STEP, esquecerAbaAnterior } from '@/app/components/Sidebar';
import { useAuthStore } from '@/app/store/auth';
import { useSidebarStore } from '@/app/store/sidebar';

/**
 * As barras que ganharam a aba "Agenda".
 *
 * A pílula dourada corre por aritmética (`índice × SIDEBAR_STEP`), e não
 * medindo o DOM: uma aba nova no meio da lista só fica alinhada se o índice da
 * aba ativa for o da posição em que ela aparece. É isso que se confere aqui,
 * junto com o que a barra do visualizador mostra para cada conta.
 */
let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('../../hooks/useApi', () => ({
  useTicketStats: () => ({ data: { abertos: 2 } }),
  useAccessRequests: () => ({ data: [] }),
}));

const pilula = (container) => container.querySelector('.sidebar-pill');

beforeEach(() => {
  esquecerAbaAnterior();
  useSidebarStore.setState({ collapsed: false, animated: false, hydrated: false });
  useAuthStore.setState({ user: { id: 'u1', name: 'Vera', memberships: [{ building_id: 'p1', role: 'VIEWER' }] }, isLoading: false });
});

describe('VisualizadorSidebar', () => {
  it('mostra Painel e Agenda, com Perfil e Sair no pé', () => {
    mockPathname = '/desktop/visualizacao';
    render(<VisualizadorSidebar buildingName="Edifício Aurora" />);

    expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/desktop/visualizacao');
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/desktop/visualizacao/agenda');
    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('Edifício Aurora')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Meus chamados' })).not.toBeInTheDocument();
  });

  it('acende só o painel na raiz, e a agenda na rota dela, com a pílula na segunda posição', () => {
    mockPathname = '/desktop/visualizacao/agenda';
    const { container } = render(<VisualizadorSidebar />);

    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('aria-current');
    expect(pilula(container)).toHaveStyle({ transform: `translateY(${SIDEBAR_STEP}px)` });
  });

  it('mantém o atalho de "Meus chamados" para quem também é responsável', () => {
    mockPathname = '/desktop/visualizacao';
    useAuthStore.setState({
      user: { id: 'u1', memberships: [{ building_id: 'p1', role: 'VIEWER' }, { building_id: 'p2', role: 'RESPONSAVEL' }] },
    });
    render(<VisualizadorSidebar />);
    expect(screen.getByRole('link', { name: 'Meus chamados' })).toHaveAttribute('href', '/responsavel/chamados');
  });

  it('esconde a agenda de quem não supervisiona prédio nenhum', () => {
    expect(itensDoVisualizador({ supervisiona: false }).map((i) => i.label)).toEqual(['Painel']);
    mockPathname = '/desktop/visualizacao';
    render(<VisualizadorSidebar supervisiona={false} />);
    expect(screen.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
  });
});

describe('GestorSidebar', () => {
  it('põe a Agenda logo depois de Painel e Análise, antes dos chamados', () => {
    expect(itemsFor('p1').map((i) => i.label)).toEqual([
      'Painel', 'Análise', 'Agenda', 'Novos chamados', 'Processamento', 'Finalizados', 'Colaboradores',
    ]);
  });

  it('alinha a pílula com a Agenda (terceira aba) e com as abas que desceram uma posição', () => {
    mockPathname = '/gestor/predios/p1/agenda';
    const agenda = render(<GestorSidebar buildingId="p1" buildingName="Aurora" />);
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    expect(pilula(agenda.container)).toHaveStyle({ transform: `translateY(${2 * SIDEBAR_STEP}px)` });
    agenda.unmount();

    mockPathname = '/gestor/predios/p1/colaboradores';
    const colab = render(<GestorSidebar buildingId="p1" buildingName="Aurora" />);
    expect(screen.getByRole('link', { name: 'Colaboradores' })).toHaveAttribute('aria-current', 'page');
    expect(pilula(colab.container)).toHaveStyle({ transform: `translateY(${6 * SIDEBAR_STEP}px)` });
  });
});
