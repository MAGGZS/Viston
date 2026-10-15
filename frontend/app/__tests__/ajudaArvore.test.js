import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

let mockParams = {};
let mockSearch = new URLSearchParams();
let mockPathname = '/ajuda';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => mockPathname,
  useParams: () => mockParams,
  useSearchParams: () => mockSearch,
}));

// Caminho relativo: o `jest.mock` é içado para antes do mapeamento de alias.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import AjudaPage from '@/app/ajuda/page';
import PastaPage from '@/app/ajuda/[pasta]/page';
import TutorialPage from '@/app/ajuda/[pasta]/[funcionalidade]/page';
import { AjudaShell } from '@/app/components/ajuda/AjudaShell';
import { useAuthStore } from '@/app/store/auth';
import { simularAparelho, COMPUTADOR, TELEFONE } from './helpers/aparelho';

/**
 * A central no computador: a árvore das pastas à esquerda, montada no layout
 * (AjudaShell), e a tela à direita. O telefone continua com o fluxo de sempre,
 * que é o que ajudaUsuario.test.js cobre página a página.
 */

const INSPETOR = {
  id: 'u1',
  kind: 'USER',
  role: 'NONE',
  name: 'Marina Alves',
  email: 'marina@viston.com',
  memberships: [{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }],
};

function pasta(slug, title, extra = {}) {
  return { id: `id-${slug}`, slug, title, description: `Tudo sobre ${title}.`, icon: 'Rocket', order: 1, admin_only: false, mine: false, feature_count: 2, ...extra };
}

const PASTAS = [
  pasta('inspetor', 'Inspetor', { mine: true, icon: 'ClipboardCheck' }),
  pasta('primeiros-passos', 'Primeiros passos'),
  pasta('gestor', 'Gestor', { icon: 'Building2', feature_count: 1 }),
  pasta('moderador', 'Moderador', { feature_count: 0 }),
];

const tutorial = (id, slug, title, extra = {}) => ({ id, slug, title, summary: null, device: 'MOBILE', order: 1, duration_s: 40, poster_url: null, ...extra });

const CONTEUDO = {
  inspetor: [
    tutorial('f1', 'inspetor-vistoria-completa', 'Fazer uma vistoria completa'),
    tutorial('f2', 'inspetor-historico', 'Ver o histórico do dia', { duration_s: null }),
  ],
  'primeiros-passos': [
    tutorial('f3', 'primeiros-passos-entrar-codigo', 'Entrar em um prédio pelo código'),
    tutorial('f4', 'primeiros-passos-perfil', 'Ajustar o perfil', { device: 'DESKTOP' }),
  ],
  gestor: [tutorial('f5', 'gestor-equipe', 'Convidar a equipe', { device: 'DESKTOP' })],
};

const FEATURE = {
  id: 'f1',
  slug: 'inspetor-vistoria-completa',
  title: 'Fazer uma vistoria completa',
  summary: 'A vistoria é feita andando pelo prédio.',
  device: 'MOBILE',
  duration_s: null,
  folder: { slug: 'inspetor', title: 'Inspetor' },
  video_url: null,
  captions_url: null,
  poster_url: null,
  urls_expire_at: null,
  steps: [
    { id: 's1', order: 1, title: 'Começar', body: 'Abra a vistoria.', start_s: null },
    { id: 's2', order: 2, title: 'Enviar', body: 'Envie a vistoria.', start_s: null },
  ],
  my_feedback: null,
};

function rotas(extra = {}) {
  const r = { '/help/folders': { folders: PASTAS }, ...extra };
  for (const [slug, features] of Object.entries(CONTEUDO)) {
    const p = PASTAS.find((x) => x.slug === slug);
    r[`/help/folders/${slug}`] = { folder: p, features };
  }
  r[`/help/features/${FEATURE.slug}`] = { feature: FEATURE };
  r[`/help/features/inspetor-historico`] = { feature: { ...FEATURE, id: 'f2', slug: 'inspetor-historico', title: 'Ver o histórico do dia' } };
  return r;
}

function telaComoComputador(desktop) {
  simularAparelho(desktop ? COMPUTADOR : TELEFONE);
}

/** Monta o layout com a página dentro, e devolve como trocar de página sem desmontar o layout. */
function montar(Tela, { desktop = true, params = {}, caminho = '/ajuda', respostas = rotas() } = {}) {
  telaComoComputador(desktop);
  mockParams = params;
  mockPathname = caminho;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  useAuthStore.setState({ user: INSPETOR, isLoading: false });
  api.get.mockImplementation((url, config) => {
    const resposta = respostas[url];
    if (resposta === undefined) return Promise.resolve({ data: [] });
    return typeof resposta === 'function' ? resposta(config) : Promise.resolve({ data: resposta });
  });
  const arvore = (Pagina) => (
    <QueryClientProvider client={client}>
      <AjudaShell>
        <Pagina />
      </AjudaShell>
    </QueryClientProvider>
  );
  const resultado = render(arvore(Tela));
  return {
    ...resultado,
    /** O que o Next faz ao seguir um link da árvore: novos parâmetros, mesma casca. */
    navegar(Pagina, novos, novoCaminho) {
      mockParams = novos;
      mockPathname = novoCaminho;
      resultado.rerender(arvore(Pagina));
    },
  };
}

const arvore = () => screen.getByRole('tree', { name: 'Pastas e tutoriais' });
const item = (nome) => within(arvore()).getByRole('treeitem', { name: new RegExp(nome) });
const itemTalvez = (nome) => within(arvore()).queryByRole('treeitem', { name: new RegExp(nome) });

const matchMediaOriginal = window.matchMedia;

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = new URLSearchParams();
});

afterAll(() => {
  window.matchMedia = matchMediaOriginal;
});

describe('no computador, a central tem a árvore das pastas', () => {
  it('"Seu cargo" vem primeiro e aberto; os outros cargos vêm recolhidos', async () => {
    const { container } = montar(AjudaPage);

    await screen.findByRole('tree', { name: 'Pastas e tutoriais' });
    expect(screen.getByRole('heading', { level: 1, name: 'Ajuda e tutoriais' })).toBeInTheDocument();

    const seu = screen.getByRole('group', { name: 'Seu cargo' });
    const outros = screen.getByRole('group', { name: 'Outros cargos' });

    const inspetor = within(seu).getByRole('treeitem', { name: /Inspetor/ });
    expect(inspetor).toHaveAttribute('aria-expanded', 'true');
    expect(inspetor).toHaveAttribute('aria-level', '1');
    expect(inspetor).toHaveAttribute('href', '/ajuda/inspetor');
    expect(inspetor).toHaveAccessibleName('Inspetor , 2 tutoriais');

    // Os tutoriais da pasta aberta, um nível abaixo.
    const vistoria = await within(arvore()).findByRole('treeitem', { name: 'Fazer uma vistoria completa' });
    expect(vistoria).toHaveAttribute('aria-level', '2');
    expect(vistoria).toHaveAttribute('href', '/ajuda/inspetor/inspetor-vistoria-completa');

    const primeiros = within(outros).getByRole('treeitem', { name: /Primeiros passos/ });
    expect(primeiros).toHaveAttribute('aria-expanded', 'false');
    expect(itemTalvez('Entrar em um prédio pelo código')).not.toBeInTheDocument();
    // A pasta recolhida nem pede os tutoriais ao servidor.
    expect(api.get).not.toHaveBeenCalledWith('/help/folders/primeiros-passos');
    // A pasta sem nada publicado não aparece.
    expect(itemTalvez('Moderador')).not.toBeInTheDocument();

    // Na central, à direita, os tutoriais do seu cargo em cartões, e não a grade de pastas.
    expect(screen.getByRole('heading', { level: 2, name: 'Comece pelo seu cargo' })).toBeInTheDocument();
    const cartoes = await screen.findByRole('list', { name: 'Tutoriais de Inspetor' });
    expect(within(cartoes).getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Outros cargos' })).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('a seta abre e fecha a pasta sem navegar', async () => {
    const user = userEvent.setup();
    const { container } = montar(AjudaPage);
    await screen.findByRole('tree');

    const seta = item('Primeiros passos').querySelector('.ajuda-no__seta');
    await user.click(seta);
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'true');
    expect(await within(arvore()).findByRole('treeitem', { name: 'Entrar em um prédio pelo código' })).toBeInTheDocument();

    await user.click(item('Primeiros passos').querySelector('.ajuda-no__seta'));
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'false');
    expect(itemTalvez('Entrar em um prédio pelo código')).not.toBeInTheDocument();

    // Fechar também a do seu cargo.
    await user.click(item('Inspetor').querySelector('.ajuda-no__seta'));
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'false');
    expect(itemTalvez('Fazer uma vistoria completa')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('marca a pasta aberta na tela da pasta, e mostra os cartões dela à direita', async () => {
    const { container } = montar(PastaPage, { params: { pasta: 'primeiros-passos' }, caminho: '/ajuda/primeiros-passos' });

    const cartoes = await screen.findByRole('list', { name: 'Tutoriais de Primeiros passos' });
    expect(within(cartoes).getAllByRole('link')).toHaveLength(2);

    // A pasta da tela abre mesmo não sendo do seu cargo, e fica marcada.
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Primeiros passos')).toHaveAttribute('aria-current', 'page');
    expect(item('Primeiros passos')).toHaveAttribute('aria-selected', 'true');
    expect(item('Inspetor')).not.toHaveAttribute('aria-current');

    // Sem a volta do telefone: a árvore é o caminho. E o título é o segundo nível.
    expect(screen.queryByRole('link', { name: /Voltar para/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Primeiros passos' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('marca o tutorial aberto, e o tutorial ocupa a coluna da direita', async () => {
    const { container } = montar(TutorialPage, {
      params: { pasta: 'inspetor', funcionalidade: 'inspetor-vistoria-completa' },
      caminho: '/ajuda/inspetor/inspetor-vistoria-completa',
    });

    await screen.findByRole('list', { name: 'Passos do tutorial' });
    const ativo = await within(arvore()).findByRole('treeitem', { name: 'Fazer uma vistoria completa' });
    expect(ativo).toHaveAttribute('aria-current', 'page');
    expect(ativo).toHaveAttribute('tabindex', '0');
    expect(item('Inspetor')).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 2, name: 'Fazer uma vistoria completa' })).toBeInTheDocument();
    expect(screen.getByText('Isso ajudou?')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('o teclado anda pela árvore: setas, Home e End, abrir e fechar', async () => {
    const user = userEvent.setup();
    montar(AjudaPage);
    await within(await screen.findByRole('tree')).findByRole('treeitem', { name: 'Ver o histórico do dia' });

    // Uma parada só do Tab: o primeiro item, sem tela marcada.
    const focaveis = within(arvore()).getAllByRole('treeitem').filter((el) => el.getAttribute('tabindex') === '0');
    expect(focaveis).toHaveLength(1);
    expect(focaveis[0]).toBe(item('Inspetor'));

    item('Inspetor').focus();
    await user.keyboard('{ArrowDown}');
    expect(item('Fazer uma vistoria completa')).toHaveFocus();
    expect(item('Fazer uma vistoria completa')).toHaveAttribute('tabindex', '0');
    expect(item('Inspetor')).toHaveAttribute('tabindex', '-1');

    // Esquerda num tutorial sobe para a pasta; de novo, fecha a pasta.
    await user.keyboard('{ArrowLeft}');
    expect(item('Inspetor')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'false');
    expect(item('Inspetor')).toHaveFocus();

    // Direita abre; de novo, entra no primeiro tutorial.
    await user.keyboard('{ArrowRight}');
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Inspetor')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(item('Fazer uma vistoria completa')).toHaveFocus();

    // End vai à última pasta; Direita abre a pasta recolhida.
    await user.keyboard('{End}');
    expect(item('Gestor')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(item('Gestor')).toHaveAttribute('aria-expanded', 'true');
    await within(arvore()).findByRole('treeitem', { name: 'Convidar a equipe' });
    await user.keyboard('{ArrowDown}');
    expect(item('Convidar a equipe')).toHaveFocus();

    // Para cima, passando de uma seção à outra.
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(item('Primeiros passos')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(item('Ver o histórico do dia')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(item('Inspetor')).toHaveFocus();
  });

  it('a busca filtra a árvore e lista os passos com o link direto para a aba', async () => {
    const user = userEvent.setup();
    const busca = jest.fn(() =>
      Promise.resolve({
        data: {
          results: [
            {
              folder_slug: 'primeiros-passos',
              folder_title: 'Primeiros passos',
              feature_slug: 'primeiros-passos-entrar-codigo',
              feature_title: 'Entrar em um prédio pelo código',
              step_order: 2,
              step_title: 'Digitar e enviar',
              snippet: 'Digite o código exatamente como recebeu...',
            },
          ],
        },
      })
    );
    const { container } = montar(AjudaPage, { respostas: rotas({ '/help/search': busca }) });
    await screen.findByRole('tree');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar nos tutoriais' }), 'codigo');

    await waitFor(() => expect(busca).toHaveBeenCalled());
    // Sem acento acha com acento; e só fica o que casa.
    expect(await within(arvore()).findByRole('treeitem', { name: 'Entrar em um prédio pelo código' })).toBeInTheDocument();
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'true');
    expect(itemTalvez('Ajustar o perfil')).not.toBeInTheDocument();
    expect(itemTalvez('Inspetor')).not.toBeInTheDocument();
    expect(itemTalvez('Gestor')).not.toBeInTheDocument();

    const passo = screen.getByRole('link', { name: /Digitar e enviar/ });
    expect(passo).toHaveAttribute('href', '/ajuda/primeiros-passos/primeiros-passos-entrar-codigo?passo=2');
    expect(within(screen.getByRole('list', { name: 'Passos encontrados' })).getAllByRole('link')).toHaveLength(1);
    expect(busca).toHaveBeenLastCalledWith({ params: { q: 'codigo' } });
    expect(await screen.findByText('1 tutorial e 1 passo encontrados.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Limpar a busca devolve a árvore como estava, e o foco ao campo.
    await user.click(screen.getByRole('button', { name: 'Limpar a busca' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar nos tutoriais' })).toHaveFocus();
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'false');
  });

  it('a busca sem nada que case diz isso, e a árvore some', async () => {
    const user = userEvent.setup();
    montar(AjudaPage, { respostas: rotas({ '/help/search': { results: [] } }) });
    await screen.findByRole('tree');
    await user.type(screen.getByRole('searchbox', { name: 'Buscar nos tutoriais' }), 'xyzw');
    expect(await screen.findByText('Nada encontrado para "xyzw". Tente outra palavra.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('tree')).not.toBeInTheDocument());
  });

  it('trocar de tutorial não desmonta a árvore, e as pastas abertas continuam abertas', async () => {
    const user = userEvent.setup();
    const tela = montar(TutorialPage, {
      params: { pasta: 'inspetor', funcionalidade: 'inspetor-vistoria-completa' },
      caminho: '/ajuda/inspetor/inspetor-vistoria-completa',
    });
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    const antes = arvore();

    // Abre "Primeiros passos" e fecha "Gestor" (que já estava fechada): a escolha é da pessoa.
    await user.click(item('Primeiros passos').querySelector('.ajuda-no__seta'));
    await within(arvore()).findByRole('treeitem', { name: 'Ajustar o perfil' });

    tela.navegar(TutorialPage, { pasta: 'inspetor', funcionalidade: 'inspetor-historico' }, '/ajuda/inspetor/inspetor-historico');
    await screen.findByRole('heading', { level: 2, name: 'Ver o histórico do dia' });

    expect(arvore()).toBe(antes);
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Ver o histórico do dia')).toHaveAttribute('aria-current', 'page');
    expect(item('Fazer uma vistoria completa')).not.toHaveAttribute('aria-current');

    // Ir para a pasta de outro cargo a abre, e a de onde se veio continua aberta.
    tela.navegar(PastaPage, { pasta: 'gestor' }, '/ajuda/gestor');
    await screen.findByRole('list', { name: 'Tutoriais de Gestor' });
    expect(arvore()).toBe(antes);
    expect(item('Gestor')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Gestor')).toHaveAttribute('aria-current', 'page');
    expect(item('Inspetor')).toHaveAttribute('aria-expanded', 'true');
    expect(item('Primeiros passos')).toHaveAttribute('aria-expanded', 'true');
  });

  it('o ícone do tutorial diz o formato: aparelho, ou lista quando é só texto', async () => {
    montar(AjudaPage);
    const comVideo = await within(await screen.findByRole('tree')).findByRole('treeitem', { name: 'Fazer uma vistoria completa' });
    const soTexto = item('Ver o histórico do dia');
    expect(comVideo.querySelector('svg.lucide-smartphone')).not.toBeNull();
    expect(soTexto.querySelector('svg.lucide-list-ordered')).not.toBeNull();
  });
});

describe('no telefone, a central continua sem árvore', () => {
  it('a central é a de sempre: busca e grade de pastas, com a casca do telefone', async () => {
    const { container } = montar(AjudaPage, { desktop: false });
    await screen.findByRole('region', { name: 'Seu cargo' });
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByLabelText('O que você quer fazer?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ajuda e tutoriais' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a pasta mantém a volta para a central e o título como h1', async () => {
    const { container } = montar(PastaPage, { desktop: false, params: { pasta: 'inspetor' }, caminho: '/ajuda/inspetor' });
    await screen.findByRole('list', { name: 'Tutoriais de Inspetor' });
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para a central de ajuda' })).toHaveAttribute('href', '/ajuda');
    expect(screen.getByRole('heading', { level: 1, name: 'Inspetor' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('o tutorial mantém a volta para a pasta', async () => {
    const { container } = montar(TutorialPage, {
      desktop: false,
      params: { pasta: 'inspetor', funcionalidade: 'inspetor-vistoria-completa' },
      caminho: '/ajuda/inspetor/inspetor-vistoria-completa',
    });
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Inspetor' })).toHaveAttribute('href', '/ajuda/inspetor');
    expect(await axe(container)).toHaveNoViolations();
  });
});
