import { render, screen } from '@testing-library/react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { useAuthStore } from '@/app/store/auth';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: (...a) => replace(...a) }) }));

/**
 * A guarda de rota.
 *
 * Ela é a única coisa entre uma tela de gestão e quem não deveria vê-la. A API
 * responde 403 de qualquer jeito, mas chegar lá já é vazamento de estrutura —
 * a pessoa vê o que existe antes de a resposta chegar.
 */
function comoUsuario(user, isLoading = false) {
  useAuthStore.setState({ user, isLoading });
}

beforeEach(() => {
  replace.mockClear();
  comoUsuario(null, false);
});

describe('RouteGuard', () => {
  it('manda para o login quem não está autenticado', () => {
    render(<RouteGuard><p>segredo</p></RouteGuard>);

    expect(screen.queryByText('segredo')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('não decide nada enquanto o perfil ainda está carregando', () => {
    // Mandar para o login aqui deslogaria quem só está esperando o `/auth/me`
    // responder — que é todo mundo, a cada recarga da página.
    comoUsuario(null, true);
    render(<RouteGuard><p>segredo</p></RouteGuard>);

    expect(replace).not.toHaveBeenCalled();
  });

  it('deixa passar quem tem o papel pedido', () => {
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'INSPECTOR' }],
    });

    render(<RouteGuard roles={['INSPECTOR']}><p>vistoria</p></RouteGuard>);
    expect(screen.getByText('vistoria')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('barra quem tem outro papel', () => {
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'VIEWER' }],
    });

    render(<RouteGuard roles={['INSPECTOR']}><p>vistoria</p></RouteGuard>);
    expect(screen.queryByText('vistoria')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('gestor de um prédio não entra na tela de outro', () => {
    // Este é o caso que o `roles` sozinho deixava passar: ser GESTOR em algum
    // lugar não é ser gestor *daquele* prédio.
    comoUsuario({
      kind: 'MANAGER',
      memberships: [{ building_id: 'meu-predio', role: 'GESTOR' }],
    });

    render(<RouteGuard manages="predio-alheio"><p>gestão</p></RouteGuard>);
    expect(screen.queryByText('gestão')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('gestor entra na tela do prédio dele', () => {
    comoUsuario({
      kind: 'MANAGER',
      memberships: [{ building_id: 'meu-predio', role: 'GESTOR' }],
    });

    render(<RouteGuard manages="meu-predio"><p>gestão</p></RouteGuard>);
    expect(screen.getByText('gestão')).toBeInTheDocument();
  });

  it('o ADMIN passa por qualquer prédio', () => {
    comoUsuario({ kind: 'USER', role: 'ADMIN', memberships: [] });

    render(<RouteGuard manages="qualquer-predio"><p>suporte</p></RouteGuard>);
    expect(screen.getByText('suporte')).toBeInTheDocument();
  });

  it('quem só visualiza não abre no telefone', () => {
    // `matchMedia` responde `matches: false` no jsdom (ver jest.setup.js), que
    // é exatamente a largura de telefone.
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [{ building_id: 'p1', role: 'VIEWER' }],
    });

    render(<RouteGuard roles={['VIEWER']}><p>painel</p></RouteGuard>);
    expect(screen.queryByText('painel')).not.toBeInTheDocument();
    expect(screen.getByText(/apenas pelo computador/i)).toBeInTheDocument();
    // A saída vem escrita: abrir no computador ou pedir outro papel ao gestor.
    expect(
      screen.getByText(
        'Você é visualizador neste prédio. Abra o Viston no computador ou peça ao gestor para mudar seu papel.'
      )
    ).toBeInTheDocument();
  });

  it('o aviso do telefone leva ao tutorial que o explica', () => {
    comoUsuario({ kind: 'USER', role: 'NONE', memberships: [{ building_id: 'p1', role: 'VIEWER' }] });

    render(<RouteGuard roles={['VIEWER']}><p>painel</p></RouteGuard>);
    expect(screen.getByRole('link', { name: 'Ver tutorial' })).toHaveAttribute(
      'href',
      '/ajuda/visualizador/visualizador-so-computador'
    );
  });

  it('com qualquerAparelho, o visualizador vê a tela no telefone', () => {
    comoUsuario({ kind: 'USER', role: 'NONE', memberships: [{ building_id: 'p1', role: 'VIEWER' }] });

    render(<RouteGuard qualquerAparelho><p>ajuda</p></RouteGuard>);
    expect(screen.getByText('ajuda')).toBeInTheDocument();
    expect(screen.queryByText(/apenas pelo computador/i)).not.toBeInTheDocument();
  });

  it('sem qualquerAparelho, o mesmo visualizador vê o aviso', () => {
    comoUsuario({ kind: 'USER', role: 'NONE', memberships: [{ building_id: 'p1', role: 'VIEWER' }] });

    render(<RouteGuard><p>ajuda</p></RouteGuard>);
    expect(screen.queryByText('ajuda')).not.toBeInTheDocument();
    expect(screen.getByText(/apenas pelo computador/i)).toBeInTheDocument();
  });

  it('qualquerAparelho não abre a tela para quem não tem o papel exigido', () => {
    comoUsuario({ kind: 'USER', role: 'NONE', memberships: [{ building_id: 'p1', role: 'VIEWER' }] });

    render(<RouteGuard roles={['INSPECTOR']} qualquerAparelho><p>vistoria</p></RouteGuard>);
    expect(screen.queryByText('vistoria')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('com mais de um prédio, todos como visualizador, a frase não fala de um prédio só', () => {
    comoUsuario({
      kind: 'USER',
      role: 'NONE',
      memberships: [
        { building_id: 'p1', role: 'VIEWER' },
        { building_id: 'p2', role: 'VIEWER' },
      ],
    });

    render(<RouteGuard roles={['VIEWER']}><p>painel</p></RouteGuard>);
    expect(screen.getByText(/você é visualizador nos seus prédios/i)).toBeInTheDocument();
    expect(screen.getByText(/peça ao gestor para mudar seu papel/i)).toBeInTheDocument();
  });
});
