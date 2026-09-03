import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/perfil',
  useSearchParams: () => new URLSearchParams(),
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import PerfilPage from '@/app/perfil/page';
import { useAuthStore } from '@/app/store/auth';

const PREDIO = { building_id: 'p1', name: 'Aurora', role: 'MODERADOR' };

function conta(extra = {}) {
  return {
    id: 'u1',
    name: 'Marina Alves',
    email: 'marina@viston.com',
    memberships: [PREDIO],
    ...extra,
  };
}

function Tela(user = conta()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({ user, isLoading: false });

  api.get.mockImplementation((url) => {
    if (url.includes('/buildings/me') || url.endsWith('/buildings')) {
      return Promise.resolve({ data: [PREDIO] });
    }
    if (url.includes('/feedbacks')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });

  return render(
    <QueryClientProvider client={client}>
      <PerfilPage />
    </QueryClientProvider>
  );
}

/** A coluna de seções do desktop — há uma cópia mobile da tela na mesma página. */
const secoes = () => screen.getByRole('navigation', { name: 'Seções da conta' });
const aba = (nome) => within(secoes()).getByRole('button', { name: nome });

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
});

/**
 * A tela de conta no desktop.
 *
 * Era uma coluna de linhas que abriam caixas: para conferir o próprio e-mail
 * era preciso abrir o formulário que o altera. Virou uma tela de configurações
 * — as seções à esquerda, o valor à vista, e editar como gesto à parte.
 */
describe('perfil no desktop', () => {
  it('abre em "Meu perfil", com os dados à vista e não atrás de um formulário', async () => {
    Tela();

    expect(await screen.findByText('Configurações da conta')).toBeInTheDocument();
    expect(aba('Meu perfil')).toHaveAttribute('aria-current', 'page');

    const painel = screen.getByText('Informações pessoais').closest('section');
    expect(within(painel).getByText('marina@viston.com')).toBeInTheDocument();
    expect(within(painel).getByText('Marina Alves')).toBeInTheDocument();
  });

  it('troca de seção sem sair da tela', async () => {
    const user = userEvent.setup();
    Tela();
    await screen.findByText('Configurações da conta');

    await user.click(aba('Segurança'));

    expect(await screen.findByText(/Trocar a senha encerra as sessões/)).toBeInTheDocument();
    expect(aba('Segurança')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('Informações pessoais')).not.toBeInTheDocument();
  });

  it('editar abre a caixa que já existia, e não um segundo formulário', async () => {
    const user = userEvent.setup();
    Tela();
    await screen.findByText('Configurações da conta');

    const bloco = screen.getByText('Informações pessoais').closest('section');
    await user.click(within(bloco).getByRole('button', { name: /Editar/ }));

    expect(await screen.findByRole('heading', { name: 'Identificação' })).toBeInTheDocument();
  });

  it('"Excluir conta" fecha a lista, em vermelho e à parte', async () => {
    const user = userEvent.setup();
    Tela();
    await screen.findByText('Configurações da conta');

    const abas = within(secoes()).getAllByRole('button');
    expect(abas[abas.length - 1]).toHaveTextContent('Excluir conta');

    await user.click(aba('Excluir conta'));
    expect(await screen.findByText(/Isto não tem volta/)).toBeInTheDocument();
  });

  it('quem tem barra lateral continua com ela — o perfil deixa de ser um desvio', async () => {
    Tela();

    // O moderador entra pelo menu lateral, e clicar em "Perfil" fazia o menu
    // sumir: sair da área para mexer na conta perde o fio de onde se estava.
    expect(await screen.findByRole('link', { name: /Processamento/ })).toBeInTheDocument();
  });

  it('conta sem barra lateral ganha o cabeçalho com a saída', async () => {
    // Inspetor: a área dele não tem menu lateral em tela nenhuma.
    const { container } = Tela(conta({ memberships: [{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }] }));

    await screen.findByText('Configurações da conta');

    // Dentro do cabeçalho do desktop: a versão de telefone da mesma página
    // também está na árvore — quem a esconde é a folha de estilo, que o jsdom
    // não aplica —, e ela tem os seus próprios botões.
    const cabecalho = container.querySelector('header');
    expect(within(cabecalho).getByRole('button', { name: /Sair/ })).toBeInTheDocument();
    expect(within(cabecalho).getByRole('button', { name: /Voltar/ })).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: /Processamento/ })).not.toBeInTheDocument();
  });

  it('o gestor não vê a seção de prédio — ele administra vários e não se desvincula aqui', async () => {
    Tela(conta({ kind: 'MANAGER', memberships: [{ building_id: 'p1', name: 'Aurora', role: 'GESTOR' }] }));

    await screen.findByText('Configurações da conta');
    expect(within(secoes()).queryByRole('button', { name: 'Prédio' })).not.toBeInTheDocument();
  });
});
