import fs from 'fs';
import path from 'path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

let mockParams = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/desktop/admin/tutoriais',
  useParams: () => mockParams,
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import TutoriaisAdminPage from '@/app/desktop/admin/tutoriais/page';
import TutorialAdminPage from '@/app/desktop/admin/tutoriais/[id]/page';
import { useAuthStore } from '@/app/store/auth';

const ADMIN = { id: 'a1', kind: 'USER', role: 'ADMIN', name: 'Suporte', email: 's@viston.com', memberships: [] };

// `state` é o campo legado, que a API ainda manda na transição; a tela lê
// `published` e `video_state`. Ele vem aqui com o valor da regra do contrato
// para provar que a tela não depende mais dele.
function linha(id, slug, title, { published = true, video_state = 'SEM_VIDEO', ...extra } = {}) {
  const state = video_state === 'EM_DIA' ? (published ? 'PUBLICADO' : 'RASCUNHO') : video_state;
  return {
    id, slug, title, summary: null, device: 'MOBILE', order: 1, published, video_state, state, in_catalog: true,
    step_count: 4, duration_s: video_state === 'SEM_VIDEO' ? null : 40, video_uploaded_at: null, ...extra,
  };
}

const ARVORE = {
  total: 4,
  published_counts: { published: 3, unpublished: 1 },
  video_counts: { SEM_VIDEO: 2, EM_DIA: 1, DESATUALIZADO: 1 },
  counts: { SEM_VIDEO: 2, RASCUNHO: 0, PUBLICADO: 1, DESATUALIZADO: 1 },
  folders: [
    {
      id: 'p-insp', slug: 'inspetor', title: 'Inspetor', description: 'Vistoria.', icon: 'ClipboardCheck', order: 1, target_roles: ['INSPECTOR'], admin_only: false,
      features: [
        linha('f1', 'inspetor-vistoria-completa', 'Fazer uma vistoria completa'),
        linha('f2', 'inspetor-historico', 'Histórico e relatório do dia', { video_state: 'DESATUALIZADO' }),
      ],
    },
    {
      id: 'p-mod', slug: 'moderador', title: 'Moderador', description: 'Chamados.', icon: 'ShieldCheck', order: 2, target_roles: ['MODERADOR'], admin_only: false,
      features: [
        linha('f3', 'moderador-painel', 'O painel do moderador', { video_state: 'EM_DIA' }),
        linha('f4', 'moderador-encaminhar', 'Encaminhar um chamado', { published: false }),
      ],
    },
  ],
};

const STEPS = [
  { id: 's1', order: 1, title: 'Começar', body: 'Abra a vistoria.', start_s: null },
  { id: 's2', order: 2, title: 'Escolher os andares', body: 'Marque os andares.', start_s: null },
  { id: 's3', order: 3, title: 'Registrar', body: 'Registre cada andar.', start_s: null },
  { id: 's4', order: 4, title: 'Enviar', body: 'Envie a vistoria.', start_s: null },
];

const SEM_VIDEO = {
  id: 'f1', slug: 'inspetor-vistoria-completa', title: 'Fazer uma vistoria completa', summary: null, device: 'MOBILE', order: 1,
  published: false, video_state: 'SEM_VIDEO', state: 'SEM_VIDEO', in_catalog: true, catalog_script_hash: 'h', video_script_hash: null, duration_s: null,
  video_uploaded_at: null, video_uploaded_by: null, folder: { id: 'p-insp', slug: 'inspetor', title: 'Inspetor' },
  video_url: null, captions_url: null, poster_url: null, urls_expire_at: null, steps: STEPS,
};

const COM_VIDEO = {
  ...SEM_VIDEO, video_state: 'EM_DIA', state: 'RASCUNHO', video_script_hash: 'h', duration_s: 40,
  video_uploaded_at: '2026-10-09T12:00:00.000Z', video_uploaded_by: { id: 'a1', name: 'Suporte' },
  video_url: 'https://x.supabase.co/video.mp4?t=1', captions_url: 'https://x.supabase.co/legenda.vtt?t=1',
  poster_url: 'https://x.supabase.co/capa.jpg?t=1', urls_expire_at: '2099-01-01T00:00:00.000Z',
  steps: STEPS.map((s, i) => ({ ...s, start_s: [0, 9.4, 18, 30][i] })),
};

function montar(Tela, { feature, arvore = ARVORE } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({ user: ADMIN, isLoading: false });
  api.get.mockImplementation((url) => {
    if (url === '/admin/help/tree') return Promise.resolve({ data: arvore });
    if (url.startsWith('/admin/help/features/')) return Promise.resolve({ data: { feature } });
    if (url === '/feedbacks') return Promise.resolve({ data: { items: [], pending: 0 } });
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
});

describe('árvore dos tutoriais', () => {
  it('mostra uma fileira só de contagens, pelo vídeo, e filtra por ela', async () => {
    const user = userEvent.setup();
    const { container } = montar(TutoriaisAdminPage);

    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    expect(screen.getAllByRole('group', { name: /^Filtrar/ })).toHaveLength(1);
    expect(within(filtro).getByRole('button', { name: /Todos\s*4/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filtro).getByRole('button', { name: /Sem vídeo\s*2/ })).toBeInTheDocument();
    expect(within(filtro).getByRole('button', { name: /Em dia\s*1/ })).toBeInTheDocument();
    expect(within(filtro).getByRole('button', { name: /Desatualizado\s*1/ })).toBeInTheDocument();
    expect(within(filtro).getByRole('button', { name: /Despublicados\s*1/ })).toBeInTheDocument();
    expect(within(filtro).queryByRole('button', { name: /^Publicados/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Encaminhar um chamado/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(within(filtro).getByRole('button', { name: /Desatualizado/ }));

    expect(within(filtro).getByRole('button', { name: /Desatualizado/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filtro).getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /Histórico e relatório do dia/ })).toHaveTextContent('Vídeo desatualizado');
    expect(screen.queryByRole('link', { name: /Encaminhar um chamado/ })).not.toBeInTheDocument();
    // A pasta sem nada no filtro escolhido some junto.
    expect(screen.queryByRole('heading', { name: 'Moderador' })).not.toBeInTheDocument();
    // Com filtro, a ordem trava.
    expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
    expect(screen.getByText(/a ordem fica travada/)).toBeInTheDocument();
  });

  it('sem nenhum despublicado, o chip de despublicados não aparece', async () => {
    const tudoNoAr = {
      ...ARVORE,
      published_counts: { published: 4, unpublished: 0 },
      folders: ARVORE.folders.map((f) => ({ ...f, features: f.features.map((x) => ({ ...x, published: true })) })),
    };
    montar(TutoriaisAdminPage, { arvore: tudoNoAr });

    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    expect(within(filtro).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos4', 'Sem vídeo2', 'Em dia1', 'Desatualizado1']);
  });

  it('cada funcionalidade tem dois selos: publicação e vídeo', async () => {
    montar(TutoriaisAdminPage);

    const semVideoNoAr = await screen.findByRole('link', { name: /Fazer uma vistoria completa/ });
    expect(semVideoNoAr).toHaveTextContent('Publicado');
    expect(semVideoNoAr).toHaveTextContent('Sem vídeo');

    const emDia = screen.getByRole('link', { name: /O painel do moderador/ });
    expect(emDia).toHaveTextContent('Publicado');
    expect(emDia).toHaveTextContent('Vídeo em dia');

    const foraDoAr = screen.getByRole('link', { name: /Encaminhar um chamado/ });
    expect(foraDoAr).toHaveTextContent('Despublicado');
    expect(foraDoAr).toHaveTextContent('Sem vídeo');
  });

  it('um filtro de cada vez: escolher outro troca o anterior', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);

    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    const ligados = () => within(filtro).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');

    await user.click(within(filtro).getByRole('button', { name: /Sem vídeo/ }));
    expect(ligados()).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Fazer uma vistoria completa/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Encaminhar um chamado/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /O painel do moderador/ })).not.toBeInTheDocument();

    // Despublicados não se soma ao "Sem vídeo": troca. Só o despublicado fica.
    await user.click(within(filtro).getByRole('button', { name: /Despublicados/ }));
    expect(ligados()).toHaveLength(1);
    expect(within(filtro).getByRole('button', { name: /Despublicados/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filtro).getByRole('button', { name: /Sem vídeo/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('link', { name: /Encaminhar um chamado/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Fazer uma vistoria completa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inspetor' })).not.toBeInTheDocument();

    await user.click(within(filtro).getByRole('button', { name: /Todos/ }));
    expect(ligados()).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Subir/ }).length).toBeGreaterThan(0);
  });

  it('filtro sem nenhuma funcionalidade diz que não há nada', async () => {
    const user = userEvent.setup();
    const semDesatualizado = {
      ...ARVORE,
      video_counts: { SEM_VIDEO: 3, EM_DIA: 1, DESATUALIZADO: 0 },
      folders: ARVORE.folders.map((f) => ({ ...f, features: f.features.map((x) => (x.video_state === 'DESATUALIZADO' ? { ...x, video_state: 'SEM_VIDEO' } : x)) })),
    };
    montar(TutoriaisAdminPage, { arvore: semDesatualizado });

    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    await user.click(within(filtro).getByRole('button', { name: /Desatualizado\s*0/ }));
    expect(screen.getByText('Nenhuma funcionalidade com este filtro.')).toBeInTheDocument();
  });

  it('sem as contagens novas (servidor da versão anterior), conta pela própria árvore', async () => {
    const antiga = { counts: ARVORE.counts, folders: ARVORE.folders };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    useAuthStore.setState({ user: ADMIN, isLoading: false });
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/admin/help/tree' ? antiga : { items: [], pending: 0 } }));
    render(
      <QueryClientProvider client={client}>
        <TutoriaisAdminPage />
      </QueryClientProvider>
    );
    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    expect(within(filtro).getByRole('button', { name: /Todos\s*4/ })).toBeInTheDocument();
    expect(within(filtro).getByRole('button', { name: /Despublicados\s*1/ })).toBeInTheDocument();
    expect(within(filtro).getByRole('button', { name: /Sem vídeo\s*2/ })).toBeInTheDocument();
  });

  it('o sincronizar avisa que funcionalidades novas nascem publicadas', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    await user.click(screen.getByRole('button', { name: /Sincronizar catálogo/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Sincronizar catálogo' });
    expect(caixa).toHaveTextContent('Funcionalidades novas nascem publicadas');
  });

  it('reordena pastas e funcionalidades pelos botões de subir e descer', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ data: ARVORE });
    montar(TutoriaisAdminPage);

    await user.click(await screen.findByRole('button', { name: 'Descer a pasta Inspetor' }));
    expect(api.patch).toHaveBeenCalledWith('/admin/help/folders/order', { ids: ['p-mod', 'p-insp'] });

    await user.click(screen.getByRole('button', { name: 'Subir Encaminhar um chamado' }));
    expect(api.patch).toHaveBeenCalledWith('/admin/help/folders/p-mod/features/order', { ids: ['f4', 'f3'] });

    expect(screen.getByRole('button', { name: 'Subir a pasta Inspetor' })).toBeDisabled();
  });

  it('edita título e resumo da funcionalidade', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ data: { feature: { ...SEM_VIDEO, title: 'Vistoria do começo ao fim' } } });
    montar(TutoriaisAdminPage);

    await user.click(await screen.findByRole('button', { name: 'Editar Fazer uma vistoria completa' }));
    const titulo = screen.getByLabelText('Título');
    await user.clear(titulo);
    await user.type(titulo, 'Vistoria do começo ao fim');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.patch).toHaveBeenCalledWith('/admin/help/features/f1', { title: 'Vistoria do começo ao fim', summary: null });
  });
});

/**
 * Um `XMLHttpRequest` que o teste conduz: guarda o que a tela mandou e deixa o
 * teste decidir quando cada arquivo progride e termina.
 */
class XhrFalso {
  static todos = [];
  constructor() {
    this.headers = {};
    this.upload = {};
    XhrFalso.todos.push(this);
  }
  open(metodo, url) { this.metodo = metodo; this.url = url; }
  setRequestHeader(nome, valor) { this.headers[nome] = valor; }
  send(corpo) { this.corpo = corpo; }
  abort() { this.onabort?.(); }
  responder(status = 200) { this.status = status; this.responseText = '{}'; this.onload(); }
}

function pacote({ pasta = 'inspetor', id = 'inspetor-vistoria-completa', abas = 4 } = {}) {
  const passos = {
    pasta, id, script_hash: 'h', duracao_s: 40,
    abas: Array.from({ length: abas }, (_, i) => ({ ordem: i + 1, titulo: `Aba ${i + 1}`, texto: 'Texto', inicio_s: i * 9 })),
  };
  return [
    new File(['v'.repeat(300)], 'video.mp4', { type: 'video/mp4' }),
    new File(['WEBVTT'], 'legenda.vtt', { type: 'text/vtt' }),
    new File(['jpg'], 'capa.jpg', { type: 'image/jpeg' }),
    new File([JSON.stringify(passos)], 'passos.json', { type: 'application/json' }),
  ];
}

const URLS = {
  upload_id: 'up-1',
  expires_in: 7200,
  files: Object.fromEntries(
    [['video.mp4', 'video/mp4'], ['legenda.vtt', 'text/vtt'], ['capa.jpg', 'image/jpeg'], ['passos.json', 'application/json']].map(([nome, tipo]) => [
      nome,
      { path: `tmp/${nome}`, upload_url: `https://x.supabase.co/upload/${nome}?token=t`, token: 't', content_type: tipo, max_bytes: 8388608 },
    ])
  ),
};

describe('seleção em lote na árvore', () => {
  const barra = () => screen.getByRole('toolbar', { name: 'Ações da seleção' });
  const conta = () => barra().querySelector('.barra-sel__conta');

  it('entra no modo com foco na primeira caixa, trava a ordem e passa no axe', async () => {
    const user = userEvent.setup();
    const { container } = montar(TutoriaisAdminPage);

    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));

    // Uma caixa por funcionalidade e uma por pasta.
    const caixas = screen.getAllByRole('checkbox');
    expect(caixas).toHaveLength(6);
    expect(caixas[0]).toHaveAccessibleName('Todos os tutoriais de Inspetor');
    expect(caixas[0]).toHaveFocus();
    // O nome da caixa da funcionalidade é o título dela.
    expect(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Selecionar' })).toHaveAttribute('aria-pressed', 'true');
    expect(conta()).toHaveTextContent('Nenhum selecionado');
    // No modo, a linha não é link, e não há lápis nem setas.
    expect(screen.queryByRole('link', { name: /Encaminhar um chamado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Subir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Durante a seleção, a ordem fica travada/)).toBeInTheDocument();
    expect(within(barra()).getByRole('button', { name: 'Sair da seleção' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('clicar em qualquer ponto da linha marca, e a contagem é anunciada', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));

    await user.click(screen.getByText('O painel do moderador'));
    expect(screen.getByRole('checkbox', { name: 'O painel do moderador' })).toBeChecked();
    expect(conta()).toHaveTextContent('1 selecionado');
    expect(screen.getByText('1 tutorial selecionado')).toHaveAttribute('aria-live', 'polite');
  });

  it('com nada marcado, publicar e despublicar ficam desabilitados e a barra diz por quê', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));

    const publicar = within(barra()).getByRole('button', { name: 'Publicar' });
    const despublicar = within(barra()).getByRole('button', { name: 'Despublicar' });
    expect(publicar).toBeDisabled();
    expect(despublicar).toBeDisabled();
    expect(within(barra()).getByRole('button', { name: 'Limpar' })).toBeDisabled();
    expect(publicar).toHaveAccessibleDescription('Marque um tutorial');
    expect(publicar).toHaveAttribute('title', 'Marque um tutorial');
    // Nada de frase longa no meio da barra.
    expect(barra()).not.toHaveTextContent(/ao menos/);

    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));
    expect(publicar).toBeEnabled();
    expect(despublicar).toBeEnabled();

    await user.click(within(barra()).getByRole('button', { name: 'Limpar' }));
    expect(conta()).toHaveTextContent('Nenhum selecionado');
    // Limpar desmarca sem sair do modo.
    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
  });

  it('a caixa da pasta marca e desmarca as dela, e fica meio-marcada com parte', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    const pasta = screen.getByRole('checkbox', { name: 'Todos os tutoriais de Moderador' });

    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));
    expect(pasta).not.toBeChecked();
    expect(pasta.indeterminate).toBe(true);

    await user.click(pasta);
    expect(pasta).toBeChecked();
    expect(pasta.indeterminate).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fazer uma vistoria completa' })).not.toBeChecked();
    expect(conta()).toHaveTextContent('2 selecionados');

    await user.click(pasta);
    expect(conta()).toHaveTextContent('Nenhum selecionado');
  });

  it('"Sair da seleção" sai, limpa a seleção e devolve o foco ao "Selecionar"', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    const selecionar = await screen.findByRole('button', { name: 'Selecionar' });
    await user.click(selecionar);
    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));

    await user.click(within(barra()).getByRole('button', { name: 'Sair da seleção' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    expect(selecionar).toHaveFocus();
    expect(screen.getAllByRole('button', { name: /^Subir/ }).length).toBeGreaterThan(0);

    // De volta ao modo, nada continua marcado.
    await user.click(selecionar);
    expect(screen.getAllByRole('checkbox').every((c) => !c.checked)).toBe(true);
  });

  it('Escape sai do modo', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    const selecionar = await screen.findByRole('button', { name: 'Selecionar' });
    await user.click(selecionar);
    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(selecionar).toHaveFocus();
  });

  it('as setas andam entre os botões habilitados da barra', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    within(barra()).getByRole('button', { name: 'Selecionar todos' }).focus();

    // Limpar, Despublicar e Publicar estão desabilitados com nada marcado:
    // de "Selecionar todos", a seta para a direita dá a volta até o X.
    await user.keyboard('{ArrowRight}');
    expect(within(barra()).getByRole('button', { name: 'Sair da seleção' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(barra()).getByRole('button', { name: 'Selecionar todos' })).toHaveFocus();
  });

  it('"Selecionar todos" respeita o filtro ligado', async () => {
    const user = userEvent.setup();
    montar(TutoriaisAdminPage);
    const filtro = await screen.findByRole('group', { name: 'Filtrar tutoriais' });
    await user.click(within(filtro).getByRole('button', { name: /Sem vídeo/ }));
    await user.click(screen.getByRole('button', { name: 'Selecionar' }));

    await user.click(within(barra()).getByRole('button', { name: 'Selecionar todos' }));
    expect(conta()).toHaveTextContent('2 selecionados');
    expect(screen.getByRole('checkbox', { name: 'Fazer uma vistoria completa' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'O painel do moderador' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Todos os tutoriais de Moderador neste filtro' })).toBeChecked();
    // Com tudo à vista marcado, não há mais o que marcar.
    expect(within(barra()).getByRole('button', { name: 'Selecionar todos' })).toBeDisabled();
  });

  it('despublicar em lote pede confirmação de cautela citando quantos, chama a rota e sai do modo', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { updated: 2 } });
    montar(TutoriaisAdminPage);
    const selecionar = await screen.findByRole('button', { name: 'Selecionar' });
    await user.click(selecionar);
    await user.click(screen.getByRole('checkbox', { name: 'Fazer uma vistoria completa' }));
    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));

    await user.click(within(barra()).getByRole('button', { name: 'Despublicar' }));
    const caixa = await screen.findByRole('dialog', { name: 'Despublicar 2 tutoriais?' });
    expect(caixa).toHaveTextContent('Os 2 tutoriais escolhidos saem da central de ajuda');
    expect(caixa.querySelector('[data-tone="danger"]')).not.toBeNull();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(within(caixa).getByRole('button', { name: 'Despublicar' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/help/features/publish-batch', { ids: ['f1', 'f3'], published: false })
    );
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
    expect(selecionar).toHaveFocus();
  });

  it('a confirmação do lote não mora dentro da faixa que não recebe clique', async () => {
    // O defeito que segurou o lote: a faixa da barra tem `pointer-events: none`
    // (só a barra recebe clique), e a confirmação, renderizada dentro dela,
    // herdava isso. O jsdom não carrega o CSS, então a prova é a posição da
    // caixa na árvore, junto com a regra que torna a posição importante.
    const css = fs.readFileSync(path.join(__dirname, '../globals.css'), 'utf8');
    expect(css).toMatch(/\.barra-sel-faixa \{[^}]*pointer-events: none/);

    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { updated: 2 } });
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    await user.click(within(barra()).getByRole('button', { name: 'Selecionar todos' }));
    await user.click(within(barra()).getByRole('button', { name: 'Publicar' }));

    const caixa = await screen.findByRole('dialog', { name: 'Publicar 4 tutoriais?' });
    expect(caixa.closest('.barra-sel-faixa')).toBeNull();

    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/help/features/publish-batch', { ids: ['f1', 'f2', 'f3', 'f4'], published: true })
    );
  });

  it('publicar em lote pede confirmação neutra, e voltar não chama a rota', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { updated: 1 } });
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    await user.click(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' }));

    await user.click(within(barra()).getByRole('button', { name: 'Publicar' }));
    let caixa = await screen.findByRole('dialog', { name: 'Publicar 1 tutorial?' });
    expect(caixa.querySelector('[data-tone="neutral"]')).not.toBeNull();
    await user.click(within(caixa).getByRole('button', { name: 'Voltar' }));
    expect(api.post).not.toHaveBeenCalled();
    // Fechar a confirmação não tira do modo.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' })).toBeChecked();

    await user.click(within(barra()).getByRole('button', { name: 'Publicar' }));
    caixa = await screen.findByRole('dialog', { name: 'Publicar 1 tutorial?' });
    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/help/features/publish-batch', { ids: ['f4'], published: true })
    );
  });

  it('enquanto o lote vai ao servidor, o botão mostra "Publicando...", Voltar trava e a caixa só fecha na resposta', async () => {
    const user = userEvent.setup();
    let responder;
    api.post.mockImplementation(() => new Promise((ok) => { responder = ok; }));
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    await user.click(screen.getByRole('checkbox', { name: 'Encaminhar um chamado' }));
    await user.click(within(barra()).getByRole('button', { name: 'Publicar' }));
    const caixa = await screen.findByRole('dialog', { name: 'Publicar 1 tutorial?' });
    const chamadasDaArvore = api.get.mock.calls.filter(([url]) => url === '/admin/help/tree').length;

    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));

    const ocupado = within(caixa).getByRole('button', { name: 'Publicando...' });
    expect(ocupado).toHaveAttribute('aria-busy', 'true');
    expect(ocupado).toBeDisabled();
    expect(within(caixa).getByRole('button', { name: 'Voltar' })).toBeDisabled();
    expect(within(caixa).getByText('Publicando 1 tutorial')).toHaveAttribute('aria-live', 'polite');
    // Escape não fecha no meio do envio.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Publicar 1 tutorial?' })).toBeInTheDocument();

    await act(async () => responder({ data: { updated: 1 } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // A árvore é relida, para os selos novos.
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([url]) => url === '/admin/help/tree').length).toBeGreaterThan(chamadasDaArvore)
    );
  });

  it('se o lote falha, a caixa continua aberta com a mensagem do servidor e o botão volta ao normal', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({ response: { data: { error: { code: 'NOT_FOUND', message: 'Algum dos tutoriais escolhidos não existe mais.' } } } });
    montar(TutoriaisAdminPage);
    await user.click(await screen.findByRole('button', { name: 'Selecionar' }));
    await user.click(screen.getByRole('checkbox', { name: 'O painel do moderador' }));
    await user.click(within(barra()).getByRole('button', { name: 'Despublicar' }));
    const caixa = await screen.findByRole('dialog', { name: 'Despublicar 1 tutorial?' });

    await user.click(within(caixa).getByRole('button', { name: 'Despublicar' }));

    expect(await within(caixa).findByRole('alert')).toHaveTextContent('Algum dos tutoriais escolhidos não existe mais.');
    expect(within(caixa).getByRole('button', { name: 'Despublicar' })).toBeEnabled();
    expect(within(caixa).getByRole('button', { name: 'Voltar' })).toBeEnabled();
    // A seleção continua de pé para tentar de novo.
    expect(screen.getByRole('checkbox', { name: 'O painel do moderador' })).toBeChecked();
  });
});

describe('a funcionalidade, no admin', () => {
  const xhrOriginal = global.XMLHttpRequest;
  beforeEach(() => {
    XhrFalso.todos = [];
    global.XMLHttpRequest = XhrFalso;
  });
  afterEach(() => {
    global.XMLHttpRequest = xhrOriginal;
  });

  function abrir(feature) {
    mockParams = { id: feature.id };
    return montar(TutorialAdminPage, { feature });
  }

  it('mostra o cabeçalho com os dois selos, as abas sem tempo e passa no axe', async () => {
    const { container } = abrir(SEM_VIDEO);
    const titulo = await screen.findByRole('heading', { level: 1, name: 'Fazer uma vistoria completa' });
    const cabecalho = titulo.closest('header');
    expect(cabecalho).toHaveTextContent('Despublicado');
    expect(cabecalho).toHaveTextContent('Sem vídeo');
    expect(screen.getAllByText('Sem tempo')).toHaveLength(4);
    // Publicar não depende de vídeo.
    expect(screen.getByRole('button', { name: /Publicar/ })).toBeEnabled();
    expect(screen.queryByText(/envie o vídeo primeiro/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a pré-visualização sem vídeo é o passo a passo em texto, igual ao do usuário', async () => {
    const user = userEvent.setup();
    abrir(SEM_VIDEO);
    const previa = await screen.findByRole('region', { name: 'Pré-visualização' });
    expect(previa.querySelector('video')).toBeNull();
    expect(within(previa).getByText('Passo a passo em texto')).toBeInTheDocument();
    await user.click(within(previa).getByRole('tab', { name: /Registrar/ }));
    expect(within(previa).getByRole('tabpanel')).toHaveTextContent('Registre cada andar.');
  });

  it('publica sem vídeo, e a confirmação diz que vai só com os passos em texto', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feature: { ...SEM_VIDEO, published: true } } });
    abrir(SEM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: /Publicar/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Publicar este tutorial?' });
    expect(caixa).toHaveTextContent('só com os passos em texto');
    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));
    expect(api.post).toHaveBeenCalledWith('/admin/help/features/f1/publish');
    expect(await screen.findByRole('button', { name: /Despublicar/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent('Publicado');
  });

  it('recusa pacote de outra funcionalidade antes de enviar, e diz qual é a certa', async () => {
    const user = userEvent.setup();
    abrir(SEM_VIDEO);
    await screen.findByRole('heading', { level: 1 });
    // A árvore em cache é o que dá nome e link à funcionalidade certa.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/help/tree'));

    await user.upload(screen.getByLabelText(/Ou escolher os 4 arquivos/), pacote({ id: 'inspetor-historico', abas: 3 }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Histórico e relatório do dia');
    expect(within(alerta).getByRole('link', { name: /Histórico e relatório do dia/ })).toHaveAttribute('href', '/desktop/admin/tutoriais/f2');
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Enviar vídeo/ })).not.toBeInTheDocument();
  });

  it('envia direto ao Storage com barra de progresso e depois confirma', async () => {
    const user = userEvent.setup();
    api.post.mockImplementation((url) => {
      if (url.endsWith('/upload-urls')) return Promise.resolve({ data: URLS });
      if (url.endsWith('/commit')) return Promise.resolve({ data: { feature: COM_VIDEO } });
      return Promise.reject(new Error('rota inesperada'));
    });
    abrir(SEM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    await user.upload(screen.getByLabelText(/Ou escolher os 4 arquivos/), pacote());
    await user.click(await screen.findByRole('button', { name: /Enviar vídeo/ }));

    await waitFor(() => expect(XhrFalso.todos).toHaveLength(1));
    const primeiro = XhrFalso.todos[0];
    expect(primeiro.metodo).toBe('PUT');
    expect(primeiro.url).toBe(URLS.files['video.mp4'].upload_url);
    expect(primeiro.headers).toEqual({ 'Content-Type': 'video/mp4', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' });

    act(() => primeiro.upload.onprogress({ lengthComputable: true, loaded: 150, total: 300 }));
    const barra = screen.getByRole('progressbar', { name: 'Envio do pacote' });
    const meio = Number(barra.getAttribute('aria-valuenow'));
    expect(meio).toBeGreaterThan(0);
    expect(meio).toBeLessThan(100);

    for (let i = 0; i < 4; i += 1) {
      await waitFor(() => expect(XhrFalso.todos).toHaveLength(i + 1));
      act(() => XhrFalso.todos[i].responder(200));
    }

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/help/features/f1/video/commit', { upload_id: 'up-1' }));
    expect(XhrFalso.todos.map((x) => x.headers['Content-Type'])).toEqual(['video/mp4', 'text/vtt', 'image/jpeg', 'application/json']);
  });

  it('mostra o erro de validação do commit com o arquivo a marcar', async () => {
    const user = userEvent.setup();
    api.post.mockImplementation((url) => {
      if (url.endsWith('/upload-urls')) return Promise.resolve({ data: URLS });
      return Promise.reject({
        response: { status: 400, data: { error: { code: 'PACOTE_INVALIDO', message: 'O vídeo precisa estar em H.264. Gere o pacote de novo.', details: { arquivo: 'video.mp4' } } } },
      });
    });
    abrir(SEM_VIDEO);
    await screen.findByRole('heading', { level: 1 });
    await user.upload(screen.getByLabelText(/Ou escolher os 4 arquivos/), pacote());
    await user.click(await screen.findByRole('button', { name: /Enviar vídeo/ }));
    for (let i = 0; i < 4; i += 1) {
      await waitFor(() => expect(XhrFalso.todos).toHaveLength(i + 1));
      act(() => XhrFalso.todos[i].responder(200));
    }

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('video.mp4');
    expect(alerta).toHaveTextContent('H.264');
  });

  it('"Usar o tempo atual do vídeo" grava na hora o tempo da pré-visualização', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ data: { feature: COM_VIDEO } });
    abrir(COM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    document.querySelector('video').currentTime = 12.5;
    await user.click(screen.getByRole('button', { name: 'Ajustar a aba 2, Escolher os andares' }));
    // Abrir o formulário leva o foco ao primeiro campo.
    expect(screen.getByLabelText('Título')).toHaveFocus();

    const usar = screen.getByRole('button', { name: /Usar o tempo atual do vídeo/ });
    await user.click(usar);
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('/admin/help/steps/s2', { start_s: 12.5 });
    expect(screen.getByLabelText('Início (segundos)')).toHaveValue('12.5');
    // O botão não perde o foco enquanto grava.
    await waitFor(() => expect(screen.getByRole('button', { name: /Usar o tempo atual do vídeo/ })).toHaveFocus());
  });

  it('"Usar o tempo atual do vídeo" mostra o erro no campo quando a gravação falha', async () => {
    const user = userEvent.setup();
    api.patch.mockRejectedValue({ response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'O tempo de início passa da duração do vídeo.' } } } });
    abrir(COM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    document.querySelector('video').currentTime = 12.5;
    await user.click(screen.getByRole('button', { name: 'Ajustar a aba 2, Escolher os andares' }));
    await user.click(screen.getByRole('button', { name: /Usar o tempo atual do vídeo/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('passa da duração do vídeo');
    expect(screen.getByLabelText('Início (segundos)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('fechar o ajuste da aba devolve o foco ao lápis dela', async () => {
    const user = userEvent.setup();
    abrir(COM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: 'Ajustar a aba 3, Registrar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Ajustar a aba 3, Registrar' })).toHaveFocus();
  });

  it('publicar pede confirmação neutra antes de ir ao servidor', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feature: { ...COM_VIDEO, published: true, state: 'PUBLICADO' } } });
    abrir(COM_VIDEO);
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: /Publicar/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Publicar este tutorial?' });
    expect(api.post).not.toHaveBeenCalled();
    expect(caixa.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'neutral');

    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));
    expect(api.post).toHaveBeenCalledWith('/admin/help/features/f1/publish');
  });

  it('despublicar e substituir o vídeo pedem confirmação de cautela', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { feature: COM_VIDEO } });
    abrir({ ...COM_VIDEO, published: true, state: 'PUBLICADO' });
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: /Despublicar/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Despublicar este tutorial?' });
    expect(caixa.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    await user.click(within(caixa).getByRole('button', { name: 'Voltar' }));
    expect(api.post).not.toHaveBeenCalled();

    await user.upload(screen.getByLabelText(/Ou escolher os 4 arquivos/), pacote());
    await user.click(await screen.findByRole('button', { name: /Substituir vídeo/ }));
    const substituir = await screen.findByRole('dialog', { name: 'Substituir o vídeo?' });
    expect(substituir.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    expect(substituir).toHaveTextContent('continua publicado');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('avisa quando o vídeo está desatualizado, pelo video_state', async () => {
    abrir({ ...COM_VIDEO, published: true, video_state: 'DESATUALIZADO', state: 'DESATUALIZADO', video_script_hash: 'velho' });
    const aviso = await screen.findByRole('note');
    expect(aviso).toHaveTextContent('O roteiro deste tutorial mudou depois da gravação');
    expect(aviso).toHaveTextContent('continua no ar');
  });

  it('com o vídeo em dia, não há aviso', async () => {
    abrir({ ...COM_VIDEO, published: true, state: 'PUBLICADO' });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
  it('publicar um só mostra "Publicando..." até a resposta, e o erro mantém a caixa aberta', async () => {
    const user = userEvent.setup();
    mockParams = { id: 'f1' };
    let responder;
    api.post.mockImplementationOnce(() => new Promise((ok) => { responder = ok; }));
    montar(TutorialAdminPage, { feature: SEM_VIDEO });

    await user.click(await screen.findByRole('button', { name: /Publicar/ }));
    let caixa = await screen.findByRole('dialog', { name: 'Publicar este tutorial?' });
    await user.click(within(caixa).getByRole('button', { name: 'Publicar' }));

    expect(within(caixa).getByRole('button', { name: 'Publicando...' })).toHaveAttribute('aria-busy', 'true');
    expect(within(caixa).getByRole('button', { name: 'Voltar' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Publicar este tutorial?' })).toBeInTheDocument();

    await act(async () => responder({ data: { feature: { ...SEM_VIDEO, published: true } } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Agora o erro: despublicar recusado deixa a caixa aberta com o motivo.
    api.post.mockRejectedValueOnce({ response: { data: { error: { code: 'NOT_FOUND', message: 'Funcionalidade não encontrada' } } } });
    await user.click(await screen.findByRole('button', { name: /Despublicar/ }));
    caixa = await screen.findByRole('dialog', { name: 'Despublicar este tutorial?' });
    await user.click(within(caixa).getByRole('button', { name: 'Despublicar' }));
    expect(await within(caixa).findByRole('alert')).toHaveTextContent('Funcionalidade não encontrada');
    expect(within(caixa).getByRole('button', { name: 'Despublicar' })).toBeEnabled();
  });
});
