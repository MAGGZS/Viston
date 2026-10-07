import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspetorSidebar } from '@/app/components/InspetorSidebar';
import { SIDEBAR_STEP, esquecerAbaAnterior } from '@/app/components/Sidebar';
import { useAuthStore } from '@/app/store/auth';

const replace = jest.fn();
let pathname = '/desktop/inspetor';
jest.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: (...a) => replace(...a) }),
}));

// O prédio ativo vem de `useActiveBuilding`, que lê os vínculos da API: aqui,
// os mesmos da conta.
let mockPredios = [];
jest.mock('../../hooks/useApi', () => ({
  useMyBuildings: () => ({ data: mockPredios, isLoading: false }),
}));

function conta(memberships) {
  mockPredios = memberships;
  const logout = jest.fn().mockResolvedValue();
  useAuthStore.setState({
    user: { id: 'u1', kind: 'USER', role: 'NONE', name: 'Marina', memberships },
    isLoading: false,
    logout,
  });
  return logout;
}

beforeEach(() => {
  esquecerAbaAnterior();
  replace.mockClear();
  pathname = '/desktop/inspetor';
});

/** O menu do inspetor no computador: Início, Histórico, e o pé de sempre. */
describe('InspetorSidebar', () => {
  it('tem Início e Histórico na navegação, Perfil e Sair no pé', () => {
    conta([{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }]);
    render(<InspetorSidebar />);

    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/desktop/inspetor');
    expect(within(nav).getByRole('link', { name: 'Histórico' })).toHaveAttribute('href', '/historico');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('marca a aba da rota atual', () => {
    conta([{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }]);
    pathname = '/historico';
    render(<InspetorSidebar />);
    expect(screen.getByRole('link', { name: 'Histórico' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it('mostra o prédio ativo no subtítulo, e o que a página manda quando ela manda', () => {
    conta([
      { building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' },
      { building_id: 'p2', name: 'Torre Sul', role: 'INSPECTOR' },
    ]);
    const { unmount } = render(<InspetorSidebar />);
    expect(screen.getByText('Aurora')).toBeInTheDocument();
    unmount();

    render(<InspetorSidebar buildingName="Torre Sul" />);
    expect(screen.getByText('Torre Sul')).toBeInTheDocument();
  });

  it('só a conta que também supervisiona ganha a aba Agenda, entre Início e Histórico', () => {
    conta([{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }]);
    const { unmount } = render(<InspetorSidebar />);
    expect(screen.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
    unmount();

    conta([
      { building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' },
      { building_id: 'p2', name: 'Torre Sul', role: 'VIEWER' },
    ]);
    pathname = '/historico';
    const { container } = render(<InspetorSidebar />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/desktop/inspetor', '/desktop/visualizacao/agenda', '/historico']);
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/desktop/visualizacao/agenda');
    // A pílula acompanha o Histórico, que desceu para a terceira posição.
    expect(container.querySelector('.sidebar-pill')).toHaveStyle({ transform: `translateY(${2 * SIDEBAR_STEP}px)` });
  });

  it('Sair encerra a sessão e volta ao login', async () => {
    const logout = conta([{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }]);
    render(<InspetorSidebar />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));
    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
