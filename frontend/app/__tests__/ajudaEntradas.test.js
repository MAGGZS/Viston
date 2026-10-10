import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...a) => mockPush(...a), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/perfil',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(() => Promise.resolve({ data: [] })), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

import PerfilPage from '@/app/perfil/page';
import { BotaoAjuda } from '@/app/components/ajuda/BotaoAjuda';
import { GestorHeader } from '@/app/components/GestorHeader';
import { AJUDA_POR_TELA, linkDaAjuda } from '@/app/lib/ajudaContexto';
import { useAuthStore } from '@/app/store/auth';

const CONTA = { id: 'u1', kind: 'USER', role: 'NONE', name: 'Marina Alves', email: 'marina@viston.com', memberships: [] };

function perfil() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({ user: CONTA, isLoading: false });
  return render(
    <QueryClientProvider client={client}>
      <PerfilPage />
    </QueryClientProvider>
  );
}

beforeEach(() => mockPush.mockClear());

/**
 * As portas da central de ajuda.
 *
 * Decisão do proprietário: a entrada principal é uma linha no Perfil, no
 * telefone e no computador, e não um item nas barras laterais. Nas telas
 * principais, o "?" do cabeçalho abre o tutorial daquela tela.
 */
describe('pontos de entrada da ajuda', () => {
  it('o Perfil no telefone tem a linha "Ajuda e tutoriais", que abre a central', async () => {
    const user = userEvent.setup();
    perfil();

    // Há duas larguras na mesma página; a linha do telefone é um botão de linha.
    const linhas = await screen.findAllByRole('button', { name: /Ajuda e tutoriais/ });
    const doTelefone = linhas.find((b) => b.classList.contains('profile-row'));
    await user.click(doTelefone);
    expect(mockPush).toHaveBeenCalledWith('/ajuda');
  });

  it('as Configurações da conta no computador têm a seção "Ajuda e tutoriais"', async () => {
    const user = userEvent.setup();
    perfil();

    const secoes = await screen.findByRole('navigation', { name: 'Seções da conta' });
    await user.click(within(secoes).getByRole('button', { name: 'Ajuda e tutoriais' }));
    const abrir = await screen.findByRole('link', { name: /Abrir/ });
    expect(abrir).toHaveAttribute('href', '/ajuda');
  });

  it('o "?" leva ao tutorial da tela, pelo mapa', async () => {
    const { container } = render(<BotaoAjuda contexto="inspetor.vistoria" />);
    const link = screen.getByRole('link', { name: 'Ajuda sobre esta tela' });
    expect(link).toHaveAttribute('href', '/ajuda/inspetor/inspetor-vistoria-completa');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('tela fora do mapa não ganha um "?" que leva a lugar nenhum', () => {
    const { container } = render(<BotaoAjuda contexto="nao-existe" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('as telas do admin não têm "?": o ADMIN não tem tutorial', () => {
    const doAdmin = Object.entries(AJUDA_POR_TELA).filter(
      ([chave, alvo]) => chave.startsWith('admin.') || alvo.tela.startsWith('/desktop/admin') || alvo.pasta === 'administracao'
    );
    expect(doAdmin).toEqual([]);
    expect(linkDaAjuda('admin.painel')).toBeNull();
    expect(linkDaAjuda('admin.tutoriais')).toBeNull();
  });

  it('a tela de prédios do gestor tem o "?" no cabeçalho', () => {
    useAuthStore.setState({ user: { ...CONTA, kind: 'MANAGER' }, isLoading: false });
    render(<GestorHeader ajuda="gestor.predios" />);
    expect(screen.getByRole('link', { name: 'Ajuda sobre esta tela' })).toHaveAttribute('href', '/ajuda/gestor/gestor-criar-conta-predio');
  });
});
