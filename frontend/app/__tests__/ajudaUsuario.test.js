import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

const mockReplace = jest.fn();
let mockParams = {};
let mockSearch = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: (...a) => mockReplace(...a), back: jest.fn() }),
  usePathname: () => '/ajuda',
  useParams: () => mockParams,
  useSearchParams: () => mockSearch,
}));

// Caminho relativo, e não o alias: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import AjudaPage from '@/app/ajuda/page';
import PastaPage from '@/app/ajuda/[pasta]/page';
import TutorialPage from '@/app/ajuda/[pasta]/[funcionalidade]/page';
import { useAuthStore } from '@/app/store/auth';

const INSPETOR = {
  id: 'u1',
  kind: 'USER',
  role: 'NONE',
  name: 'Marina Alves',
  email: 'marina@viston.com',
  memberships: [{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }],
};

const ADMIN = { id: 'a1', kind: 'USER', role: 'ADMIN', name: 'Suporte', email: 's@viston.com', memberships: [] };

function pasta(slug, title, extra = {}) {
  return { id: `id-${slug}`, slug, title, description: `Tudo sobre ${title}.`, icon: 'Rocket', order: 1, admin_only: false, mine: false, feature_count: 2, ...extra };
}

const PASTAS = [
  pasta('primeiros-passos', 'Primeiros passos'),
  pasta('inspetor', 'Inspetor', { mine: true, icon: 'ClipboardCheck' }),
  pasta('moderador', 'Moderador', { feature_count: 0 }),
];

const FEATURE = {
  id: 'f1',
  slug: 'inspetor-vistoria-completa',
  title: 'Fazer uma vistoria completa',
  summary: 'A vistoria é feita andando pelo prédio.',
  device: 'MOBILE',
  duration_s: 40,
  folder: { slug: 'inspetor', title: 'Inspetor' },
  video_url: 'https://x.supabase.co/video.mp4?token=a',
  captions_url: 'https://x.supabase.co/legenda.vtt?token=a',
  poster_url: 'https://x.supabase.co/capa.jpg?token=a',
  urls_expire_at: '2099-01-01T00:00:00.000Z',
  steps: [
    { id: 's1', order: 1, title: 'Começar', body: 'Abra a vistoria.', start_s: 0 },
    { id: 's2', order: 2, title: 'Escolher os andares', body: 'Marque os andares.', start_s: 9.4 },
    { id: 's3', order: 3, title: 'Registrar', body: 'Registre cada andar.', start_s: 18 },
    { id: 's4', order: 4, title: 'Enviar', body: 'Envie a vistoria.', start_s: 30 },
  ],
  my_feedback: null,
};

// Publicado e ainda sem vídeo: o contrato manda as URLs, a duração e todo
// `start_s` como `null` (ver "Mudanças de 2026-10-10" em tutoriais/API.md).
const FEATURE_TEXTO = {
  ...FEATURE,
  duration_s: null,
  video_url: null,
  captions_url: null,
  poster_url: null,
  urls_expire_at: null,
  steps: FEATURE.steps.map((s) => ({ ...s, start_s: null })),
};

function montar(Tela, { user = INSPETOR, rotas = {} } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({ user, isLoading: false });
  api.get.mockImplementation((url, config) => {
    for (const [prefixo, resposta] of Object.entries(rotas)) {
      if (url === prefixo) return typeof resposta === 'function' ? resposta(config) : Promise.resolve({ data: resposta });
    }
    return Promise.resolve({ data: [] });
  });
  return render(
    <QueryClientProvider client={client}>
      <Tela />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockSearch = new URLSearchParams();
});

describe('Tela 1: pastas', () => {
  it('as pastas do cargo vêm primeiro, com a etiqueta "Seu cargo", e as outras em "Outros cargos"', async () => {
    const { container } = montar(AjudaPage, { rotas: { '/help/folders': { folders: PASTAS } } });

    const seu = await screen.findByRole('region', { name: 'Seu cargo' });
    const outros = screen.getByRole('region', { name: 'Outros cargos' });

    const cartaoInspetor = within(seu).getByRole('link', { name: /Inspetor/ });
    expect(cartaoInspetor).toHaveAttribute('href', '/ajuda/inspetor');
    expect(within(cartaoInspetor).getByText('Seu cargo')).toBeInTheDocument();

    expect(within(outros).getByRole('link', { name: /Primeiros passos/ })).toBeInTheDocument();
    expect(within(outros).queryByText('Seu cargo')).not.toBeInTheDocument();
    // Pasta sem nada publicado não aparece (decisão do proprietário).
    expect(screen.queryByRole('link', { name: /Moderador/ })).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  // O catálogo real não tem mais pasta admin_only (o ADMIN não tem tutorial),
  // mas a central continua genérica: uma pasta restrita, se a API mandar, é
  // mostrada; se não mandar, não aparece. Os dados abaixo são só de teste.
  it('uma pasta restrita só aparece quando a API a manda', async () => {
    montar(AjudaPage, { rotas: { '/help/folders': { folders: PASTAS } } });
    await screen.findByRole('region', { name: 'Seu cargo' });
    expect(screen.queryByRole('link', { name: /Equipe interna/ })).not.toBeInTheDocument();
  });

  it('para o ADMIN, uma pasta restrita que a API manda como dele fica em "Seu cargo"', async () => {
    const pastas = [...PASTAS.map((p) => ({ ...p, mine: false })), pasta('equipe-interna', 'Equipe interna', { mine: true, admin_only: true, icon: 'Settings' })];
    montar(AjudaPage, { user: ADMIN, rotas: { '/help/folders': { folders: pastas } } });
    const seu = await screen.findByRole('region', { name: 'Seu cargo' });
    expect(within(seu).getByRole('link', { name: /Equipe interna/ })).toHaveAttribute('href', '/ajuda/equipe-interna');
  });

  it('o "?" de uma pasta vazia chega à central com o aviso', async () => {
    mockSearch = new URLSearchParams('aviso=indisponivel');
    const { container } = montar(AjudaPage, { rotas: { '/help/folders': { folders: PASTAS } } });
    await screen.findByRole('region', { name: 'Seu cargo' });
    expect(screen.getByRole('status')).toHaveTextContent(/ainda está sendo preparado/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('limpar a busca devolve o foco ao campo', async () => {
    const user = userEvent.setup();
    montar(AjudaPage, { rotas: { '/help/folders': { folders: PASTAS } } });
    const campo = screen.getByLabelText('O que você quer fazer?');
    await user.type(campo, 'co');
    await user.click(screen.getByRole('button', { name: 'Limpar a busca' }));
    expect(campo).toHaveValue('');
    expect(campo).toHaveFocus();
  });

  it('a busca leva direto à aba encontrada', async () => {
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
    const { container } = montar(AjudaPage, { rotas: { '/help/folders': { folders: PASTAS }, '/help/search': busca } });

    await user.type(screen.getByLabelText('O que você quer fazer?'), 'codigo');

    const link = await screen.findByRole('link', { name: /Digitar e enviar/ });
    expect(link).toHaveAttribute('href', '/ajuda/primeiros-passos/primeiros-passos-entrar-codigo?passo=2');
    expect(busca).toHaveBeenLastCalledWith({ params: { q: 'codigo' } });
    expect(await screen.findByText('1 passo encontrado.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Tela 2: tutoriais da pasta', () => {
  it('lista os tutoriais com duração e aparelho, e avisa quando o "?" caiu num tutorial indisponível', async () => {
    mockParams = { pasta: 'inspetor' };
    mockSearch = new URLSearchParams('aviso=indisponivel');
    const { container } = montar(PastaPage, {
      rotas: {
        '/help/folders/inspetor': {
          folder: PASTAS[1],
          features: [{ id: 'f1', slug: FEATURE.slug, title: FEATURE.title, summary: FEATURE.summary, device: 'MOBILE', order: 1, duration_s: 84.2, poster_url: null }],
        },
      },
    });

    const link = await screen.findByRole('link', { name: /Fazer uma vistoria completa/ });
    expect(link).toHaveAttribute('href', '/ajuda/inspetor/inspetor-vistoria-completa');
    expect(link).toHaveTextContent('1:24');
    expect(link).toHaveTextContent('No celular');
    expect(screen.getByRole('status')).toHaveTextContent(/ainda está sendo preparado/);
    expect(screen.getByRole('link', { name: 'Voltar para a central de ajuda' })).toHaveAttribute('href', '/ajuda');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('o tutorial sem vídeo não mostra duração e leva o selo de passo a passo em texto', async () => {
    mockParams = { pasta: 'inspetor' };
    const { container } = montar(PastaPage, {
      rotas: {
        '/help/folders/inspetor': {
          folder: PASTAS[1],
          features: [
            { id: 'f1', slug: FEATURE.slug, title: FEATURE.title, summary: FEATURE.summary, device: 'MOBILE', order: 1, duration_s: null, poster_url: null },
            { id: 'f2', slug: 'inspetor-historico', title: 'Histórico do dia', summary: null, device: 'MOBILE', order: 2, duration_s: 84.2, poster_url: null },
          ],
        },
      },
    });

    const semVideo = await screen.findByRole('link', { name: /Fazer uma vistoria completa/ });
    expect(semVideo).toHaveTextContent('Passo a passo em texto');
    expect(semVideo).not.toHaveTextContent(/\d:\d\d/);
    expect(semVideo).toHaveTextContent('No celular');

    const comVideo = screen.getByRole('link', { name: /Histórico do dia/ });
    expect(comVideo).toHaveTextContent('1:24');
    expect(comVideo).not.toHaveTextContent('Passo a passo em texto');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Tela 2: pasta vazia', () => {
  const vazia = { folder: { ...PASTAS[2] }, features: [] };

  it('vindo do "?", a pasta sem tutorial publicado segue para a central com o aviso', async () => {
    mockParams = { pasta: 'moderador' };
    mockSearch = new URLSearchParams('aviso=indisponivel');
    montar(PastaPage, { rotas: { '/help/folders/moderador': vazia } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ajuda?aviso=indisponivel'));
  });

  it('vindo do "?", a pasta que responde 404 também segue para a central', async () => {
    mockParams = { pasta: 'moderador' };
    mockSearch = new URLSearchParams('aviso=indisponivel');
    montar(PastaPage, {
      rotas: { '/help/folders/moderador': () => Promise.reject({ response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Pasta não encontrada' } } } }) },
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ajuda?aviso=indisponivel'));
  });

  it('sem o aviso, a pasta vazia fica e diz que não há tutorial', async () => {
    mockParams = { pasta: 'moderador' };
    montar(PastaPage, { rotas: { '/help/folders/moderador': vazia } });
    expect(await screen.findByText('Nenhum tutorial publicado aqui ainda')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('Tela 3: o tutorial', () => {
  function abrir({ passo, feature = FEATURE } = {}) {
    mockParams = { pasta: 'inspetor', funcionalidade: feature.slug };
    mockSearch = new URLSearchParams(passo ? `passo=${passo}` : '');
    return montar(TutorialPage, { rotas: { [`/help/features/${feature.slug}`]: { feature } } });
  }

  const video = () => document.querySelector('video');

  const lista = () => screen.getByRole('list', { name: 'Passos do tutorial' });
  const passoBtn = (nome) => within(lista()).getByRole('button', { name: new RegExp(nome) });
  // A fala dita agora, destacada na transcrição.
  const falaAtual = () => document.querySelector('.ajuda-fala--agora');
  const tocar = (t) =>
    act(() => {
      video().currentTime = t;
      fireEvent.timeUpdate(video());
    });

  it('monta o vídeo como o contrato pede, com legenda em pt-BR', async () => {
    const { container } = abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    const v = video();
    expect(v).toHaveAttribute('controls');
    expect(v).toHaveAttribute('preload', 'metadata');
    expect(v).toHaveAttribute('poster', FEATURE.poster_url);
    expect(v).toHaveAttribute('playsinline');
    expect(v).toHaveAttribute('crossorigin', 'anonymous');
    const track = v.querySelector('track');
    expect(track).toHaveAttribute('kind', 'captions');
    expect(track).toHaveAttribute('srclang', 'pt-BR');
    expect(track).toHaveAttribute('default');
    // Formato contínuo: não há abas para trocar.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('clicar num passo leva o vídeo ao início dele, marca o passo e mostra o texto', async () => {
    const user = userEvent.setup();
    const replaceState = jest.spyOn(window.history, 'replaceState');
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    await user.click(passoBtn('Escolher os andares'));

    expect(video().currentTime).toBe(9.4);
    expect(passoBtn('Escolher os andares')).toHaveAttribute('aria-current', 'step');
    expect(passoBtn('Começar')).not.toHaveAttribute('aria-current');
    expect(falaAtual()).toHaveTextContent('Marque os andares.');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/ajuda/inspetor/inspetor-vistoria-completa?passo=2');
    replaceState.mockRestore();
  });

  it('o passo avança sozinho com o tempo do vídeo, e só a troca é anunciada', async () => {
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    const anuncio = document.querySelector('.ajuda-player [aria-live="polite"]');
    expect(anuncio).toHaveTextContent('');

    tocar(5);
    expect(passoBtn('Começar')).toHaveAttribute('aria-current', 'step');
    expect(anuncio).toHaveTextContent('');

    tocar(20);
    expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
    expect(anuncio).toHaveTextContent('Passo 3 de 4: Registrar');

    tocar(31);
    expect(passoBtn('Enviar')).toHaveAttribute('aria-current', 'step');
    expect(falaAtual()).toHaveTextContent('Envie a vistoria.');
    expect(anuncio).toHaveTextContent('Passo 4 de 4: Enviar');
  });

  it('a linha de capítulos tem um trecho por passo, e o atual enche com o tempo', async () => {
    const { container } = abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    const trechos = container.querySelectorAll('.ajuda-capitulo');
    expect(trechos).toHaveLength(4);
    // Tamanho proporcional ao trecho no vídeo: 9,4 s, 8,6 s, 12 s e 10 s.
    expect(trechos[0].style.flexGrow).toBe('9.4');
    expect(trechos[3].style.flexGrow).toBe('10');

    tocar(24);
    const cheio = (i) => trechos[i].querySelector('.ajuda-capitulo__cheio').style.transform;
    expect(cheio(0)).toBe('scaleX(1)');
    expect(cheio(1)).toBe('scaleX(1)');
    expect(cheio(2)).toBe('scaleX(0.5)');
    expect(cheio(3)).toBe('scaleX(0)');

    fireEvent.click(trechos[3]);
    expect(video().currentTime).toBe(30);
    expect(passoBtn('Enviar')).toHaveAttribute('aria-current', 'step');
  });

  it('o texto narrado acende a frase dita e apaga a anterior', async () => {
    const feature = {
      ...FEATURE,
      steps: [
        { id: 's1', order: 1, title: 'Começar', body: 'Primeira frase aqui. Segunda frase aqui. Terceira frase aqui.', start_s: 0 },
        { id: 's2', order: 2, title: 'Fim', body: 'Acabou.', start_s: 30 },
      ],
    };
    const { container } = abrir({ feature });
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    const estado = (texto) =>
      [...container.querySelectorAll('.ajuda-fala')].find((el) => el.textContent === texto)?.className;

    tocar(15);
    expect(estado('Segunda frase aqui.')).toContain('ajuda-fala--agora');
    expect(estado('Primeira frase aqui.')).toContain('ajuda-fala--antes');
    expect(estado('Terceira frase aqui.')).toContain('ajuda-fala--vem');

    tocar(25);
    expect(estado('Terceira frase aqui.')).toContain('ajuda-fala--agora');
    expect(estado('Segunda frase aqui.')).toContain('ajuda-fala--antes');
    expect(estado('Primeira frase aqui.')).toContain('ajuda-fala--dita');
  });

  it('sem metadados do vídeo (readyState 0), o passo continua acompanhando a reprodução', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    // O jsdom não carrega mídia: o `<video>` fica em HAVE_NOTHING, como o
    // celular antes do `loadedmetadata`. O seek ali não dispara `seeked`.
    expect(video().readyState).toBe(0);

    await user.click(passoBtn('Escolher os andares'));
    tocar(20);
    expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
  });

  it('com metadados, o timeupdate antigo não devolve o passo antes do seeked', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    Object.defineProperty(video(), 'readyState', { configurable: true, get: () => 1 });

    await user.click(passoBtn('Registrar'));
    tocar(2);
    expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');

    act(() => {
      video().currentTime = 18;
      fireEvent.seeked(video());
    });
    expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
  });

  it('sem legenda, o vídeo não ganha uma <track> vazia', async () => {
    abrir({ feature: { ...FEATURE, captions_url: null } });
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    expect(video().querySelector('track')).toBeNull();
  });

  it('?passo=N abre direto no passo N e leva o vídeo até ele', async () => {
    abrir({ passo: 3 });
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
    expect(falaAtual()).toHaveTextContent('Registre cada andar.');
    expect(video().currentTime).toBe(18);
  });

  describe('a transcrição', () => {
    const falaBtn = (texto) => within(lista()).getByRole('button', { name: new RegExp(texto) });
    const busca = () => screen.getByRole('searchbox', { name: 'Buscar na legenda' });

    it('mostra as falas do vídeo inteiro, agrupadas por passo, sem botões de próximo e anterior', async () => {
      const { container } = abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      for (const texto of ['Abra a vistoria.', 'Marque os andares.', 'Registre cada andar.', 'Envie a vistoria.']) {
        expect(falaBtn(texto)).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: /Próximo passo|Passo anterior/ })).not.toBeInTheDocument();
      expect(falaAtual()).toHaveTextContent('Abra a vistoria.');
      expect(falaAtual().closest('button')).toHaveAttribute('aria-current', 'true');
      expect(await axe(container)).toHaveNoViolations();
    });

    it('clicar numa fala leva o vídeo até ela e marca o passo dela', async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      await user.click(falaBtn('Registre cada andar.'));

      expect(video().currentTime).toBe(18);
      expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
      expect(falaAtual()).toHaveTextContent('Registre cada andar.');
    });

    it('a busca filtra as falas sem ligar para acento e caixa, realça o trecho e o Esc limpa', async () => {
      const user = userEvent.setup();
      const feature = {
        ...FEATURE,
        steps: [
          { id: 's1', order: 1, title: 'Começar', body: 'Abra a câmera do celular.', start_s: 0 },
          { id: 's2', order: 2, title: 'Fotografar', body: 'Tire a foto do andar.', start_s: 20 },
        ],
      };
      abrir({ feature });
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      await user.type(busca(), 'CAMERA');
      expect(within(lista()).getAllByRole('button', { name: /câmera/ })).toHaveLength(1);
      expect(within(lista()).queryByRole('button', { name: /Tire a foto/ })).not.toBeInTheDocument();
      expect(document.querySelector('mark.ajuda-realce')).toHaveTextContent('câmera');
      expect(screen.getByRole('status')).toHaveTextContent('1 trecho encontrado.');

      await user.keyboard('{Escape}');
      expect(busca()).toHaveValue('');
      expect(falaBtn('Tire a foto do andar.')).toBeInTheDocument();
    });

    it('sem trecho que bata, diz que não achou e oferece limpar', async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      await user.type(busca(), 'xyzw');
      expect(screen.getByText(/Nenhum trecho encontrado para/)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Nenhum trecho encontrado.');
      expect(screen.queryByRole('list', { name: 'Passos do tutorial' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Limpar a busca' }));
      expect(busca()).toHaveValue('');
      expect(lista()).toBeInTheDocument();
    });

    it('a lista segue a fala atual rolando só ela, nunca a página, e para depois de a pessoa rolar', async () => {
      abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      // O jsdom não tem layout: a lista mede 200px, e a fala atual fica abaixo dela.
      const retangulo = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.classList.contains('ajuda-roteiro__lista')) return { top: 0, bottom: 200, height: 200, left: 0, right: 300, width: 300 };
        if (this.hasAttribute('data-fala-atual')) return { top: 500, bottom: 540, height: 40, left: 0, right: 300, width: 300 };
        return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 };
      });
      const rolarLista = jest.fn();
      HTMLElement.prototype.scrollTo = rolarLista;
      const rolarPagina = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});

      try {
        tocar(20);
        expect(rolarLista).toHaveBeenCalledTimes(1);
        expect(rolarLista.mock.instances[0]).toBe(lista());
        expect(rolarLista.mock.calls[0][0].top).toBeGreaterThan(0);

        rolarLista.mockClear();
        fireEvent.wheel(lista());
        tocar(31);
        expect(rolarLista).not.toHaveBeenCalled();
        expect(rolarPagina).not.toHaveBeenCalled();
      } finally {
        retangulo.mockRestore();
        rolarPagina.mockRestore();
        delete HTMLElement.prototype.scrollTo;
      }
    });

    it('o botão de legenda liga e desliga a legenda do vídeo', async () => {
      const user = userEvent.setup();
      abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      const botao = screen.getByRole('button', { name: 'Legenda no vídeo' });
      expect(botao).toHaveAttribute('aria-pressed', 'true');
      await user.click(botao);
      expect(botao).toHaveAttribute('aria-pressed', 'false');
    });

    it('sem legenda, não há botão de legenda, e a busca continua', async () => {
      abrir({ feature: { ...FEATURE, captions_url: null } });
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      expect(screen.queryByRole('button', { name: 'Legenda no vídeo' })).not.toBeInTheDocument();
      expect(busca()).toBeInTheDocument();
    });

    it('sem tempos para estimar as falas, cada passo mostra o próprio texto', async () => {
      abrir({
        feature: { ...FEATURE, duration_s: null, captions_url: null, steps: FEATURE.steps.map((s, i) => ({ ...s, start_s: i === 0 ? 0 : null })) },
      });
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      expect(lista()).toHaveTextContent('Marque os andares.');
      expect(document.querySelector('.ajuda-deixa--corpo')).not.toBeNull();
    });

    it('o vídeo do celular começa em pé, e a orientação real vem dos metadados', async () => {
      const { container } = abrir();
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      const player = container.querySelector('.ajuda-player');
      expect(player).toHaveAttribute('data-orientacao', 'em-pe');

      Object.defineProperty(video(), 'videoWidth', { configurable: true, get: () => 1920 });
      Object.defineProperty(video(), 'videoHeight', { configurable: true, get: () => 1080 });
      fireEvent.loadedMetadata(video());
      expect(player).toHaveAttribute('data-orientacao', 'deitado');
    });
  });

  describe('sem vídeo: passo a passo em texto', () => {
    it('não monta <video>, <track> nem o palco, e mostra o selo e todos os passos', async () => {
      const { container } = abrir({ feature: FEATURE_TEXTO });
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('track')).toBeNull();
      expect(container.querySelector('.ajuda-palco')).toBeNull();
      expect(screen.getByText('Passo a passo em texto')).toBeInTheDocument();
      expect(screen.getByText('4 passos')).toBeInTheDocument();
      expect(within(lista()).getAllByRole('listitem')).toHaveLength(4);
      // Sem vídeo, não há gravação nem duração no cabeçalho.
      expect(screen.queryByText(/Gravado no/)).not.toBeInTheDocument();
      expect(screen.getByText('No celular')).toBeInTheDocument();
      // Todos os passos à vista, sem botões de próximo e anterior.
      expect(lista()).toHaveTextContent('Abra a vistoria.');
      expect(lista()).toHaveTextContent('Envie a vistoria.');
      expect(screen.queryByRole('button', { name: /Próximo passo|Passo anterior/ })).not.toBeInTheDocument();
      expect(passoBtn('Começar')).toHaveAttribute('aria-current', 'step');
    });

    it('escolher um passo o marca como atual e troca a URL', async () => {
      const user = userEvent.setup();
      const replaceState = jest.spyOn(window.history, 'replaceState');
      abrir({ feature: FEATURE_TEXTO });
      await screen.findByRole('list', { name: 'Passos do tutorial' });

      await user.click(passoBtn('Registrar'));
      expect(passoBtn('Registrar')).toHaveAttribute('aria-current', 'step');
      expect(passoBtn('Começar')).not.toHaveAttribute('aria-current');
      expect(replaceState).toHaveBeenLastCalledWith(null, '', '/ajuda/inspetor/inspetor-vistoria-completa?passo=3');
      expect(document.querySelector('video')).toBeNull();
      replaceState.mockRestore();
    });

    it('?passo=N abre com o passo N marcado', async () => {
      abrir({ feature: FEATURE_TEXTO, passo: 2 });
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      expect(passoBtn('Escolher os andares')).toHaveAttribute('aria-current', 'step');
      expect(passoBtn('Começar')).not.toHaveAttribute('aria-current');
    });

    it('passa no axe', async () => {
      const { container } = abrir({ feature: FEATURE_TEXTO });
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      expect(await axe(container)).toHaveNoViolations();
    });

    it('quando o vídeo chega, o player aparece no topo', async () => {
      const { container } = abrir({ feature: FEATURE });
      await screen.findByRole('list', { name: 'Passos do tutorial' });
      const grade = container.querySelector('.ajuda-player__grade');
      expect(grade.firstElementChild).toHaveClass('ajuda-palco');
      expect(screen.queryByText('Passo a passo em texto')).not.toBeInTheDocument();
    });
  });

  describe('o esqueleto enquanto carrega', () => {
    const nunca = () => new Promise(() => {});

    it('sem saber se há vídeo, não desenha o palco', async () => {
      mockParams = { pasta: 'inspetor', funcionalidade: FEATURE.slug };
      montar(TutorialPage, { rotas: { [`/help/features/${FEATURE.slug}`]: nunca } });
      await screen.findByText('Carregando o tutorial...');
      // Só abas e painel, que existem com e sem vídeo.
      expect(document.querySelector('[aria-busy="true"]').children).toHaveLength(2);
    });
  });

  it('"Isso ajudou?" é respondido uma vez só', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feedback: { id: 'fb1', helpful: true, created_at: '2026-10-09T12:00:00.000Z' } } });
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    await user.click(screen.getByRole('button', { name: /Sim/ }));

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/help/features/inspetor-vistoria-completa/feedback', { helpful: true });
    expect(await screen.findByText(/Obrigado pela resposta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sim/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Não/ })).not.toBeInTheDocument();
  });

  it('o teto de respostas (429) mostra a frase do servidor', async () => {
    const user = userEvent.setup();
    const mensagem = 'Muitas respostas em sequência. Tente de novo mais tarde.';
    api.post.mockRejectedValue({ response: { status: 429, data: { error: { code: 'TOO_MANY_REQUESTS', message: mensagem } } } });
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    await user.click(screen.getByRole('button', { name: /Sim/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
    expect(screen.queryByText(/Obrigado pela resposta/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sim/ })).toBeEnabled();
  });

  it('quem já respondeu não vê a pergunta de novo', async () => {
    abrir({ feature: { ...FEATURE, my_feedback: { helpful: false, created_at: '2026-10-09T12:00:00.000Z' } } });
    await screen.findByRole('list', { name: 'Passos do tutorial' });
    expect(screen.getByText(/Obrigado pela resposta/)).toBeInTheDocument();
    expect(screen.queryByText('Isso ajudou?')).not.toBeInTheDocument();
  });

  it('"Não" abre o comentário opcional antes de enviar', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feedback: { id: 'fb1', helpful: false, created_at: '2026-10-09T12:00:00.000Z' } } });
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    await user.click(screen.getByRole('button', { name: /Não/ }));
    await user.type(screen.getByLabelText('O que faltou? (opcional)'), 'Rápido demais');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    expect(api.post).toHaveBeenCalledWith('/help/features/inspetor-vistoria-completa/feedback', { helpful: false, comment: 'Rápido demais' });
  });

  it('o foco acompanha o "Isso ajudou?": campo, volta ao "Não" e agradecimento', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feedback: { id: 'fb1', helpful: false, created_at: '2026-10-09T12:00:00.000Z' } } });
    abrir();
    await screen.findByRole('list', { name: 'Passos do tutorial' });

    await user.click(screen.getByRole('button', { name: /Não/ }));
    expect(screen.getByLabelText('O que faltou? (opcional)')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('button', { name: /Não/ })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Não/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    const obrigado = await screen.findByText(/Obrigado pela resposta/);
    expect(obrigado.closest('[role="status"]')).toHaveFocus();
  });

  it('tutorial indisponível (404) leva à pasta, com aviso, em vez de quebrar', async () => {
    mockParams = { pasta: 'inspetor', funcionalidade: 'inspetor-vistoria-completa' };
    montar(TutorialPage, {
      rotas: { '/help/features/inspetor-vistoria-completa': () => Promise.reject({ response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Tutorial não encontrado' } } } }) },
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ajuda/inspetor?aviso=indisponivel'));
  });
});
