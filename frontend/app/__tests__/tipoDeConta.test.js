import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

// A busca da URL muda de teste para teste: o mesmo cadastro se comporta de um
// jeito aberto direto e de outro quando a pessoa veio de um convite.
let busca = new URLSearchParams();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: (...a) => push(...a) }),
  usePathname: () => '/',
  useSearchParams: () => busca,
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
import api from '../lib/api';

import RegisterPage from '@/app/register/page';
import RegisterGestorPage from '@/app/register/gestor/page';
import LoginPage from '@/app/login/page';
import ConectarPage from '@/app/conectar/page';
import { useAuthStore } from '@/app/store/auth';
import { ehGestorPedindoAcesso, mensagemDoPedidoDeAcesso } from '@/app/lib/erros';
import { vemDoConvite, redirectSeguro } from '@/app/lib/convite';

function Tela(Pagina) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Pagina />
    </QueryClientProvider>
  );
}

/** A recusa do servidor no formato que o interceptor entrega. */
function recusa(status, message, code = 'FORBIDDEN') {
  return Object.assign(new Error(message), {
    response: { status, data: { error: { code, message } } },
  });
}

const CONVITE = '/conectar?token=ABCD-EFGH-JKMN';

beforeEach(() => {
  busca = new URLSearchParams();
  push.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  useAuthStore.setState({ user: null, isLoading: false });
});

/**
 * Os dois cadastros apontam um para o outro, no alto da tela.
 *
 * Conta de gestor não pede acesso a prédio, e conta comum não cadastra prédio:
 * escolher o cadastro errado só aparecia no passo seguinte, quando já não havia
 * mais o que fazer na tela. O aviso fica abaixo do título, antes do primeiro
 * campo.
 */
describe('aviso cruzado entre os cadastros', () => {
  it('/register manda quem vai administrar prédios para o cadastro de gestor', async () => {
    const { container } = Tela(RegisterPage);

    const aviso = screen.getByText(/Vai cadastrar e administrar prédios\?/);
    const link = within(aviso).getByRole('link', { name: 'Crie uma conta de gestor.' });
    expect(link).toHaveAttribute('href', '/register/gestor');

    // Abaixo do título: o aviso vem antes do primeiro campo na ordem de leitura.
    const titulo = screen.getByRole('heading', { name: 'Criar conta' });
    const nome = screen.getByLabelText('Nome');
    expect(titulo.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aviso.compareDocumentPosition(nome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // O primeiro campo aponta para o aviso: quem usa leitor de tela o ouve ao
    // chegar ao formulário.
    expect(nome.getAttribute('aria-describedby')).toContain(aviso.id);

    // O link duplicado do rodapé saiu.
    expect(screen.queryByText('Cadastre-se como gestor')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('/register/gestor manda quem recebeu um convite para o cadastro comum', async () => {
    const { container } = Tela(RegisterGestorPage);

    const aviso = screen.getByText(/Recebeu um código, link ou QR Code de um prédio\?/);
    const link = within(aviso).getByRole('link', { name: 'Crie uma conta comum.' });
    expect(link).toHaveAttribute('href', '/register');
    expect(screen.getByLabelText('Nome').getAttribute('aria-describedby')).toContain(aviso.id);

    expect(screen.queryByText('Criar conta comum')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('o erro de um campo fica amarrado a ele', async () => {
    const user = userEvent.setup();
    Tela(RegisterPage);

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const email = screen.getByLabelText('E-mail');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    const ids = email.getAttribute('aria-describedby').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain('Obrigatório');
  });
});

/**
 * Quem chega pelo convite de um prédio só tem um cadastro certo, o comum.
 *
 * Nesse caminho as telas não oferecem o de gestor, e o destino de volta ao
 * convite é preservado de ponta a ponta.
 */
describe('o caminho do convite', () => {
  it('/conectar sem sessão leva ao cadastro comum, com o convite guardado, e a nenhum de gestor', async () => {
    busca = new URLSearchParams({ token: 'ABCD-EFGH-JKMN' });
    api.post.mockImplementation((url) =>
      url === '/buildings/lookup'
        ? Promise.resolve({ data: { name: 'Edifício Demonstração', description: null } })
        : Promise.reject(new Error(`inesperado: ${url}`))
    );

    Tela(ConectarPage);

    expect(await screen.findByRole('heading', { name: 'Edifício Demonstração' })).toBeInTheDocument();

    const criar = screen.getByRole('link', { name: 'Criar conta' });
    // O código volta normalizado (sem os hífens), que é como a tela o guarda.
    expect(criar).toHaveAttribute('href', `/register?redirect=${encodeURIComponent('/conectar?token=ABCDEFGHJKMN')}`);
    expect(document.querySelector('a[href^="/register/gestor"]')).toBeNull();

    // Sem sessão a tela não pergunta pelos prédios da conta: a pergunta
    // voltaria 401 e o interceptor derrubaria a sessão (ver `useMyBuildings`).
    expect(api.get).not.toHaveBeenCalled();
  });

  it('/register vindo do convite não oferece o cadastro de gestor e devolve ao convite', () => {
    busca = new URLSearchParams({ redirect: CONVITE });
    Tela(RegisterPage);

    expect(screen.queryByText(/Vai cadastrar e administrar prédios\?/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/register/gestor"]')).toBeNull();
    expect(screen.getByText(/Conta comum, a que pede acesso a prédios/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(CONVITE)}`
    );
  });

  it('/login vindo do convite não oferece o cadastro de gestor', () => {
    busca = new URLSearchParams({ redirect: CONVITE });
    Tela(LoginPage);

    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      `/register?redirect=${encodeURIComponent(CONVITE)}`
    );
    expect(screen.queryByText('Cadastre-se como gestor')).not.toBeInTheDocument();
  });

  it('/login aberto direto continua oferecendo o cadastro de gestor', () => {
    Tela(LoginPage);
    expect(screen.getByRole('link', { name: 'Cadastre-se como gestor' })).toHaveAttribute('href', '/register/gestor');
  });
});

/**
 * Conta de gestor pedindo acesso pelo convite.
 *
 * O servidor recusa com uma frase seca. A tela troca o botão pela explicação
 * do que fazer: pedir ao gestor do prédio para adicioná-la.
 */
describe('conta de gestor no convite', () => {
  it('explica que gestor entra sendo adicionado por outro gestor', async () => {
    const user = userEvent.setup();
    busca = new URLSearchParams({ token: 'ABCD-EFGH-JKMN' });
    useAuthStore.setState({
      user: { id: 'g1', kind: 'MANAGER', name: 'Paula Nunes', email: 'paula@exemplo.com', memberships: [] },
      isLoading: false,
    });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url) => {
      if (url === '/buildings/lookup') return Promise.resolve({ data: { name: 'Edifício Demonstração' } });
      if (url === '/buildings/access-requests') {
        return Promise.reject(recusa(403, 'Conta de gestor não solicita acesso a prédio', 'GESTOR_NAO_SOLICITA_ACESSO'));
      }
      return Promise.reject(new Error(`inesperado: ${url}`));
    });

    Tela(ConectarPage);
    await user.click(await screen.findByRole('button', { name: 'Solicitar Acesso ao Prédio' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Conta de gestor não pede acesso');
    expect(alerta).toHaveTextContent(/sendo adicionados por outro gestor/);
    expect(alerta).toHaveTextContent(/Peça ao gestor deste prédio para adicionar você/);
    expect(screen.queryByRole('button', { name: 'Solicitar Acesso ao Prédio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar com outra conta/ })).toBeInTheDocument();
  });
});

describe('regras do convite e do erro de gestor', () => {
  it.each([
    ['/conectar?token=X', true],
    ['/conectar', true],
    ['/conectarx', false],
    ['/home', false],
    [null, false],
  ])('vemDoConvite(%s) = %s', (redirect, esperado) => {
    expect(vemDoConvite(redirect)).toBe(esperado);
  });

  it('redirectSeguro só aceita caminho interno', () => {
    expect(redirectSeguro('/conectar?token=X')).toBe('/conectar?token=X');
    expect(redirectSeguro('//site.com')).toBeNull();
    expect(redirectSeguro('/\\site.com')).toBeNull();
    expect(redirectSeguro('https://site.com')).toBeNull();
    // O navegador apaga TAB, LF e CR de dentro da URL: sobraria "//site.com".
    expect(redirectSeguro('/\t/evil.com')).toBeNull();
    expect(redirectSeguro('/\n/evil.com')).toBeNull();
    expect(redirectSeguro('/\r/evil.com')).toBeNull();
    expect(redirectSeguro('//evil.com')).toBeNull();
    expect(redirectSeguro('/\\evil.com')).toBeNull();
    expect(redirectSeguro('javascript:alert(1)')).toBeNull();
    expect(redirectSeguro('/gestor#aba')).toBe('/gestor#aba');
  });

  it('reconhece a recusa de gestor pelo código próprio, e não por qualquer 403', () => {
    expect(ehGestorPedindoAcesso(recusa(403, 'Conta de gestor não solicita acesso a prédio', 'GESTOR_NAO_SOLICITA_ACESSO'))).toBe(true);
    // O código basta: a frase pode mudar sem a tela perder o caso.
    expect(ehGestorPedindoAcesso(recusa(403, 'Outra redação qualquer', 'GESTOR_NAO_SOLICITA_ACESSO'))).toBe(true);
    // Reserva: servidor antigo, ainda com o FORBIDDEN genérico e a frase.
    expect(ehGestorPedindoAcesso(recusa(403, 'Conta de gestor não solicita acesso a prédio'))).toBe(true);
    expect(ehGestorPedindoAcesso(recusa(403, 'Sem permissão para esta ação'))).toBe(false);
    // O código fora do 403 não vale: o caso é uma recusa, e só ela.
    expect(ehGestorPedindoAcesso(recusa(400, 'x', 'GESTOR_NAO_SOLICITA_ACESSO'))).toBe(false);
    expect(mensagemDoPedidoDeAcesso(recusa(404, 'Prédio não encontrado'))).toBe('Prédio não encontrado');
    expect(mensagemDoPedidoDeAcesso(recusa(403, 'Conta de gestor não solicita acesso a prédio'))).toMatch(
      /Peça ao gestor deste prédio para adicionar você/
    );
  });
});
