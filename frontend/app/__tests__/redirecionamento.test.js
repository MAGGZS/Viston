import { render } from '@testing-library/react';
import RootPage from '@/app/page';
import { useAuthStore } from '@/app/store/auth';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: (...a) => replace(...a) }) }));

/**
 * Para onde cada conta vai depois de entrar.
 *
 * A raiz é uma tela de um instante: ela lê o perfil e manda a pessoa para o
 * produto dela. Errar aqui é mandar o moderador para o histórico e o gestor
 * para a tela de vistoria — telas que não têm nada do que essas contas fazem.
 */
function comoUsuario(user, { desktop = false } = {}) {
  window.matchMedia = (query) => ({
    matches: desktop && query.includes('1024'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  useAuthStore.setState({ user, isLoading: false });
}

beforeEach(() => replace.mockClear());

describe('para onde a raiz manda cada conta', () => {
  it('quem não entrou vai para o login', () => {
    comoUsuario(null);
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('espera o perfil carregar antes de decidir', () => {
    // Redirecionar aqui deslogaria quem só está esperando o `/auth/me` — que é
    // todo mundo, a cada recarga.
    useAuthStore.setState({ user: null, isLoading: true });
    render(<RootPage />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('gestor vai para a área dele, mesmo sem prédio nenhum', () => {
    comoUsuario({ kind: 'MANAGER', memberships: [] });
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/gestor');
  });

  it('moderador cai na mesa de chamados', () => {
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'MODERADOR' }],
    });
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/moderador');
  });

  it('responsável que não vistoria tem tela própria', () => {
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'RESPONSAVEL' }],
    });
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/responsavel');
  });

  it('quem vistoria e também atende entra pelo app normal', () => {
    // Os chamados dele ficam a um toque, na barra de baixo — mandá-lo direto
    // para a tela de chamados esconderia a vistoria, que é o trabalho principal.
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [
        { building_id: 'p1', role: 'RESPONSAVEL' },
        { building_id: 'p2', role: 'INSPECTOR' },
      ],
    });
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/home');
  });

  it('o mesmo usuário vai para telas diferentes conforme a largura', () => {
    const conta = {
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'INSPECTOR' }],
    };

    comoUsuario(conta, { desktop: false });
    render(<RootPage />);
    expect(replace).toHaveBeenLastCalledWith('/home');

    replace.mockClear();
    comoUsuario(conta, { desktop: true });
    render(<RootPage />);
    expect(replace).toHaveBeenLastCalledWith('/desktop/visualizacao');
  });

  it('o ADMIN vai para o painel no desktop', () => {
    comoUsuario({ kind: 'USER', role: 'ADMIN', memberships: [] }, { desktop: true });
    render(<RootPage />);
    expect(replace).toHaveBeenCalledWith('/desktop/admin/dashboard');
  });
});
