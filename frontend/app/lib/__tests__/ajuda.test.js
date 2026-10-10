import fs from 'fs';
import path from 'path';
import {
  cartaoSemVideo,
  conferirPassos,
  contagensDaArvore,
  estadoDoVideo,
  formatarDuracao,
  formatarInicio,
  indiceDaAbaNoTempo,
  indiceDoPasso,
  linkDaAba,
  moverNaOrdem,
  opcoesDoFiltro,
  passaNoFiltro,
  progressoDaAba,
  separarArquivosDoPacote,
} from '@/app/lib/ajuda';
import { AJUDA_POR_TELA, linkDaAjuda } from '@/app/lib/ajudaContexto';

const STEPS = [
  { order: 1, start_s: 0 },
  { order: 2, start_s: 9.4 },
  { order: 3, start_s: null },
  { order: 4, start_s: 30 },
];

describe('aba ativa e tempo do vídeo', () => {
  it('a aba ativa é a última com início antes do tempo atual', () => {
    expect(indiceDaAbaNoTempo(STEPS, 0)).toBe(0);
    expect(indiceDaAbaNoTempo(STEPS, 9.39)).toBe(1); // folga de 50ms do seek
    expect(indiceDaAbaNoTempo(STEPS, 20)).toBe(1);
    expect(indiceDaAbaNoTempo(STEPS, 31)).toBe(3);
  });

  it('aba sem tempo não é alcançada pela reprodução', () => {
    // A terceira não tem `start_s`: dos 9,4 s aos 30 s continua valendo a segunda.
    expect(indiceDaAbaNoTempo(STEPS, 25)).toBe(1);
  });

  it('o progresso do passo vai de 0 a 1 entre o início dele e o da próxima com tempo', () => {
    expect(progressoDaAba(STEPS, 1, 9.4, 40)).toBe(0);
    expect(progressoDaAba(STEPS, 1, 19.7, 40)).toBeCloseTo(0.5, 1);
    expect(progressoDaAba(STEPS, 3, 40, 40)).toBe(1);
  });
});

describe('?passo=N', () => {
  it('lê o passo em base 1 e devolve o índice', () => {
    expect(indiceDoPasso('3', 5)).toBe(2);
  });

  it('valor fora do intervalo ou lixo abre a primeira aba', () => {
    expect(indiceDoPasso('9', 5)).toBe(0);
    expect(indiceDoPasso('0', 5)).toBe(0);
    expect(indiceDoPasso('abc', 5)).toBe(0);
    expect(indiceDoPasso(null, 5)).toBe(0);
  });

  it('o link da primeira aba não carrega ?passo', () => {
    expect(linkDaAba('inspetor', 'inspetor-historico', 1)).toBe('/ajuda/inspetor/inspetor-historico');
    expect(linkDaAba('inspetor', 'inspetor-historico', 2)).toBe('/ajuda/inspetor/inspetor-historico?passo=2');
  });
});

describe('formatos', () => {
  it('duração e início', () => {
    expect(formatarDuracao(84.2)).toBe('1:24');
    expect(formatarDuracao(15)).toBe('0:15');
    expect(formatarDuracao(null)).toBeNull();
    expect(formatarInicio(9.4)).toBe('0:09,4');
    expect(formatarInicio(72.05)).toBe('1:12,1');
  });
});

describe('conferência do pacote antes de enviar', () => {
  const feature = {
    slug: 'primeiros-passos-entrar-codigo',
    title: 'Entrar em um prédio pelo código',
    folder: { slug: 'primeiros-passos', title: 'Primeiros passos' },
    steps: [{}, {}, {}],
  };

  it('aceita o pacote de exemplo do repositório', () => {
    const texto = fs.readFileSync(path.join(__dirname, '../../../../tutoriais/exemplo/passos.json'), 'utf8');
    expect(conferirPassos(texto, feature, null).ok).toBe(true);
  });

  it('recusa pacote de outra funcionalidade e diz qual é a certa', () => {
    const arvore = {
      folders: [{ slug: 'inspetor', title: 'Inspetor', features: [{ id: 'f9', slug: 'inspetor-historico', title: 'Histórico e relatório do dia' }] }],
    };
    const r = conferirPassos(JSON.stringify({ pasta: 'inspetor', id: 'inspetor-historico', abas: [] }), feature, arvore);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Histórico e relatório do dia/);
    expect(r.destino).toEqual({ id: 'f9', titulo: 'Histórico e relatório do dia', pastaTitulo: 'Inspetor' });
  });

  it('recusa número de abas diferente', () => {
    const aba = (n) => ({ ordem: n, titulo: `Aba ${n}`, texto: 'Texto', inicio_s: n });
    const r = conferirPassos(
      JSON.stringify({ pasta: 'primeiros-passos', id: 'primeiros-passos-entrar-codigo', duracao_s: 15, abas: [aba(1), aba(2)] }),
      feature,
      null
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/2 abas/);
  });

  it('recusa passos.json acima dos tetos do formato', () => {
    const abas = Array.from({ length: 3 }, (_, i) => ({ ordem: i + 1, titulo: 'x', texto: 'y', inicio_s: i }));
    const base = { pasta: 'primeiros-passos', id: 'primeiros-passos-entrar-codigo', abas };
    expect(conferirPassos(JSON.stringify({ ...base, duracao_s: 900 }), feature, null).erro).toMatch(/entre 0 e 600/);
    const longo = { ...base, duracao_s: 15, abas: [{ ...abas[0], titulo: 'a'.repeat(121) }, abas[1], abas[2]] };
    expect(conferirPassos(JSON.stringify(longo), feature, null).erro).toMatch(/aba 1/);
  });

  it('recusa JSON quebrado', () => {
    expect(conferirPassos('{', feature, null).erro).toMatch(/não é um JSON válido/);
  });

  it('separa os quatro arquivos e aponta o que falta ou passa do limite', () => {
    const f = (name, size) => ({ name, size });
    const completo = [f('video.mp4', 100), f('legenda.vtt', 10), f('capa.jpg', 10), f('passos.json', 10), f('.DS_Store', 1)];
    expect(separarArquivosDoPacote(completo).erro).toBeNull();
    expect(separarArquivosDoPacote(completo.slice(1)).erro).toMatch(/Falta o arquivo video.mp4/);
    const grande = [f('video.mp4', 9 * 1024 * 1024), ...completo.slice(1)];
    expect(separarArquivosDoPacote(grande).arquivoComErro).toBe('video.mp4');
  });
});

it('mover na ordem troca vizinhos e recusa as pontas', () => {
  const itens = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  expect(moverNaOrdem(itens, 1, -1)).toEqual(['b', 'a', 'c']);
  expect(moverNaOrdem(itens, 0, -1)).toBeNull();
  expect(moverNaOrdem(itens, 2, 1)).toBeNull();
});

/**
 * O mapa do "?" contra o catálogo.
 *
 * Quando o roteiro renomeia ou tira uma funcionalidade, o "?" de alguma tela
 * passaria a apontar para um tutorial que não existe. Ele não quebra (a tela
 * leva à pasta), mas passa a mentir: é este teste que avisa.
 */
it('todo "?" aponta para uma funcionalidade que existe no catálogo', () => {
  const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../tutoriais/catalogo.json'), 'utf8'));
  const existe = new Set(catalogo.pastas.flatMap((p) => p.funcionalidades.map((f) => `${p.slug}/${f.id}`)));
  Object.entries(AJUDA_POR_TELA).forEach(([chave, alvo]) => {
    expect([chave, existe.has(`${alvo.pasta}/${alvo.funcionalidade}`)]).toEqual([chave, true]);
  });
  expect(linkDaAjuda('inspetor.vistoria')).toBe('/ajuda/inspetor/inspetor-vistoria-completa');
  expect(linkDaAjuda('tela-que-nao-existe')).toBeNull();
});

describe('publicação e vídeo, lidos separados', () => {
  it('o estado do vídeo vem de video_state e, na transição, cai no state antigo', () => {
    expect(estadoDoVideo({ video_state: 'EM_DIA', state: 'RASCUNHO' })).toBe('EM_DIA');
    expect(estadoDoVideo({ state: 'PUBLICADO' })).toBe('EM_DIA');
    expect(estadoDoVideo({ state: 'RASCUNHO' })).toBe('EM_DIA');
    expect(estadoDoVideo({ state: 'DESATUALIZADO' })).toBe('DESATUALIZADO');
    expect(estadoDoVideo({ state: 'SEM_VIDEO' })).toBe('SEM_VIDEO');
  });

  it('as contagens vêm da API e, sem elas, são contadas pela árvore', () => {
    const folders = [{ features: [
      { published: true, video_state: 'SEM_VIDEO' },
      { published: false, video_state: 'EM_DIA' },
      { published: true, video_state: 'DESATUALIZADO' },
    ] }];
    expect(contagensDaArvore({ folders })).toEqual({
      total: 3,
      publicacao: { published: 2, unpublished: 1 },
      video: { SEM_VIDEO: 1, EM_DIA: 1, DESATUALIZADO: 1 },
    });
    const daApi = { total: 9, published_counts: { published: 8, unpublished: 1 }, video_counts: { SEM_VIDEO: 9, EM_DIA: 0, DESATUALIZADO: 0 }, folders };
    expect(contagensDaArvore(daApi)).toEqual({ total: 9, publicacao: daApi.published_counts, video: daApi.video_counts });
  });

  it('o filtro da árvore é uma fileira só, e despublicados só entra quando há algum', () => {
    const contagens = { total: 4, publicacao: { published: 3, unpublished: 1 }, video: { SEM_VIDEO: 2, EM_DIA: 1, DESATUALIZADO: 1 } };
    expect(opcoesDoFiltro(contagens).map((o) => [o.id, o.n])).toEqual([
      ['TODOS', 4], ['SEM_VIDEO', 2], ['EM_DIA', 1], ['DESATUALIZADO', 1], ['DESPUBLICADOS', 1],
    ]);
    const tudoNoAr = { ...contagens, publicacao: { published: 4, unpublished: 0 } };
    expect(opcoesDoFiltro(tudoNoAr).map((o) => o.id)).toEqual(['TODOS', 'SEM_VIDEO', 'EM_DIA', 'DESATUALIZADO']);
  });

  it('cada filtro olha uma coisa só: o vídeo, ou a publicação no caso de despublicados', () => {
    const foraDoArSemVideo = { published: false, video_state: 'SEM_VIDEO' };
    const noArEmDia = { published: true, video_state: 'EM_DIA' };
    expect(passaNoFiltro(foraDoArSemVideo, 'TODOS')).toBe(true);
    expect(passaNoFiltro(foraDoArSemVideo, 'SEM_VIDEO')).toBe(true);
    expect(passaNoFiltro(foraDoArSemVideo, 'DESPUBLICADOS')).toBe(true);
    expect(passaNoFiltro(noArEmDia, 'DESPUBLICADOS')).toBe(false);
    expect(passaNoFiltro(noArEmDia, 'EM_DIA')).toBe(true);
    expect(passaNoFiltro(noArEmDia, 'DESATUALIZADO')).toBe(false);
  });

  it('cartão sem duração é tutorial sem vídeo', () => {
    expect(cartaoSemVideo({ duration_s: null })).toBe(true);
    expect(cartaoSemVideo({ duration_s: 84.2 })).toBe(false);
  });
});
