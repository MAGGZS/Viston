import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { catalogo, helpCatalog } from '../lib/helpCatalog';
import { planSync, resumoInicial } from '../services/helpSeed.service';
import { stateOf, videoStateOf } from '../services/help.service';
import {
  checkCaptions,
  checkContentType,
  checkPoster,
  checkSize,
  checkVideo,
  PackageProblem,
  parseSteps,
} from '../utils/helpPackage';

// O que não depende de rota nem de banco: o catálogo gerado do roteiro, a
// conferência de cada arquivo do pacote, o plano do seed e o estado calculado.

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const EXEMPLO = path.join(RAIZ, 'tutoriais', 'exemplo');
const exemplo = (arquivo: string) => readFileSync(path.join(EXEMPLO, arquivo));

describe('catálogo da central de ajuda', () => {
  it('a cópia do backend é igual à versionada em tutoriais/', () => {
    const versionado = readFileSync(path.join(RAIZ, 'tutoriais', 'catalogo.json'), 'utf8');
    const backend = readFileSync(path.join(__dirname, '..', 'data', 'catalogo.json'), 'utf8');
    expect(backend.replace(/\r\n/g, '\n')).toBe(versionado.replace(/\r\n/g, '\n'));
  });

  // Roda o script de verdade: o catálogo velho em relação ao roteiro quebra
  // aqui, no CI, e não em produção com todo vídeo marcado como desatualizado.
  it('está em dia com o roteiro', () => {
    expect(() =>
      execFileSync(process.execPath, [path.join(RAIZ, 'tutoriais', 'scripts', 'catalogo.mjs'), '--check'], {
        stdio: 'pipe',
      })
    ).not.toThrow();
  });

  // Os testes do parser e do hash moram ao lado do script (node --test); é
  // daqui que eles rodam no CI, que só conhece a suíte do backend.
  it('passa nos testes do parser e do hash', () => {
    expect(() =>
      execFileSync(process.execPath, ['--test', path.join(RAIZ, 'tutoriais', 'scripts', 'catalogo.test.mjs')], {
        stdio: 'pipe',
      })
    ).not.toThrow();
  });

  it('expõe o hash atual de cada funcionalidade, e nulo para a que não existe', () => {
    expect(helpCatalog.scriptHash('inspetor-vistoria-completa')).toMatch(/^[0-9a-f]{64}$/);
    expect(helpCatalog.scriptHash('nao-existe')).toBeNull();
  });
});

describe('pacote de exemplo', () => {
  it('passa em todas as conferências e é de uma funcionalidade real do catálogo', () => {
    expect(() => checkVideo(exemplo('video.mp4'))).not.toThrow();
    expect(() => checkPoster(exemplo('capa.jpg'))).not.toThrow();
    expect(() => checkCaptions(exemplo('legenda.vtt'))).not.toThrow();
    const passos = parseSteps(exemplo('passos.json'));
    expect(passos.script_hash).toBe(helpCatalog.scriptHash(passos.id));
    const pasta = catalogo.pastas.find((p) => p.slug === passos.pasta)!;
    const func = pasta.funcionalidades.find((f) => f.id === passos.id)!;
    expect(passos.abas).toHaveLength(func.abas.length);
  });
});

describe('conferência dos arquivos do pacote', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  it('recusa vídeo que não é MP4, mesmo com o nome certo', () => {
    expect(() => checkVideo(png)).toThrow('não é um vídeo MP4');
  });

  it('recusa MP4 sem H.264', () => {
    const semH264 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from('mp4a')]);
    expect(() => checkVideo(semH264)).toThrow('H.264');
  });

  it('recusa capa que não é JPEG', () => {
    expect(() => checkPoster(png)).toThrow('não é uma imagem JPEG');
  });

  it('recusa arquivo acima do limite, dizendo quanto tem e quanto pode', () => {
    expect(() => checkSize('video.mp4', 8 * 1024 * 1024 + 1)).toThrow('acima do limite de 8 MB');
    expect(() => checkSize('capa.jpg', 301 * 1024)).toThrow('acima do limite de 300 KB');
    expect(() => checkSize('capa.jpg', 300 * 1024)).not.toThrow();
  });

  it('recusa legenda sem cabeçalho WEBVTT, sem falas ou com tempo invertido', () => {
    expect(() => checkCaptions(Buffer.from('1\n00:00:00.000 --> 00:00:01.000\nOi\n'))).toThrow('WEBVTT');
    expect(() => checkCaptions(Buffer.from('WEBVTT\n\n'))).toThrow('nenhuma fala');
    expect(() => checkCaptions(Buffer.from('WEBVTT\n\n00:00:05.000 --> 00:00:01.000\nOi\n'))).toThrow(
      'termina antes de começar'
    );
    expect(() => checkCaptions(Buffer.from('﻿WEBVTT\r\n\r\n00:01.000 --> 00:02.500\r\nOi\r\n'))).not.toThrow();
  });

  it('recusa passos.json fora do formato ou com abas fora de ordem', () => {
    expect(() => parseSteps(Buffer.from('{'))).toThrow(PackageProblem);
    const base = JSON.parse(exemplo('passos.json').toString('utf8'));
    expect(() => parseSteps(Buffer.from(JSON.stringify({ ...base, script_hash: 'abc' })))).toThrow('script_hash');
    const trocadas = { ...base, abas: [base.abas[1], base.abas[0], base.abas[2]] };
    expect(() => parseSteps(Buffer.from(JSON.stringify(trocadas)))).toThrow('ordem');
    const depoisDoFim = { ...base, abas: base.abas.map((a: { inicio_s: number }) => ({ ...a, inicio_s: 999 })) };
    expect(() => parseSteps(Buffer.from(JSON.stringify(depoisDoFim)))).toThrow('depois do fim');
  });

  it('recusa número infinito, duração acima do teto e textos ou abas demais', () => {
    const base = exemplo('passos.json').toString('utf8');
    // `1e400` é JSON válido, e o JSON.parse o lê como Infinity.
    const infinito = base.replace('"duracao_s": 15', '"duracao_s": 1e400');
    expect(infinito).not.toBe(base);
    expect(() => parseSteps(Buffer.from(infinito))).toThrow('duracao_s');
    const abaInfinita = base.replace('"inicio_s": 10', '"inicio_s": 1e400');
    expect(() => parseSteps(Buffer.from(abaInfinita))).toThrow('inicio_s');

    const json = JSON.parse(base);
    expect(() => parseSteps(Buffer.from(JSON.stringify({ ...json, duracao_s: 601 })))).toThrow('duracao_s');
    expect(() => parseSteps(Buffer.from(JSON.stringify({ ...json, duracao_s: 600 })))).not.toThrow();
    const textoLongo = { ...json, abas: json.abas.map((a: object) => ({ ...a, texto: 'x'.repeat(2001) })) };
    expect(() => parseSteps(Buffer.from(JSON.stringify(textoLongo)))).toThrow('texto');
    const muitas = {
      ...json,
      duracao_s: 600,
      abas: Array.from({ length: 51 }, (_, i) => ({ ordem: i + 1, titulo: 't', texto: 't', inicio_s: i })),
    };
    expect(() => parseSteps(Buffer.from(JSON.stringify(muitas)))).toThrow('abas');
  });

  it('confere o tipo com que o arquivo foi gravado, sem ligar para caixa e parâmetros', () => {
    expect(() => checkContentType('legenda.vtt', 'text/vtt; charset=utf-8')).not.toThrow();
    expect(() => checkContentType('video.mp4', 'Video/MP4')).not.toThrow();
    expect(() => checkContentType('capa.jpg', 'text/html')).toThrow(PackageProblem);
    expect(() => checkContentType('passos.json', null)).toThrow('sem tipo');
  });
});

describe('estado calculado da funcionalidade', () => {
  const hash = helpCatalog.scriptHash('inspetor-historico')!;
  const base = { slug: 'inspetor-historico', video_path: 'x/video.mp4', video_script_hash: hash, published: false };

  afterEach(() => jest.restoreAllMocks());

  it('sem vídeo, rascunho e publicado', () => {
    expect(stateOf({ ...base, video_path: null })).toBe('SEM_VIDEO');
    expect(stateOf(base)).toBe('RASCUNHO');
    expect(stateOf({ ...base, published: true })).toBe('PUBLICADO');
  });

  it('fica Desatualizado quando o hash do roteiro muda depois da gravação', () => {
    expect(stateOf({ ...base, published: true })).toBe('PUBLICADO');
    jest.spyOn(helpCatalog, 'scriptHash').mockReturnValue('f'.repeat(64));
    expect(stateOf({ ...base, published: true })).toBe('DESATUALIZADO');
    expect(stateOf(base)).toBe('DESATUALIZADO');
  });

  it('fica Desatualizado quando a funcionalidade saiu do roteiro e tem vídeo', () => {
    expect(stateOf({ ...base, slug: 'saiu-do-roteiro' })).toBe('DESATUALIZADO');
    expect(stateOf({ ...base, slug: 'saiu-do-roteiro', video_path: null })).toBe('SEM_VIDEO');
  });

  it('o estado do vídeo não depende da publicação', () => {
    for (const published of [true, false]) {
      const f = { ...base, published };
      expect(videoStateOf({ ...f, video_path: null })).toBe('SEM_VIDEO');
      expect(videoStateOf(f)).toBe('EM_DIA');
      expect(videoStateOf({ ...f, slug: 'saiu-do-roteiro' })).toBe('DESATUALIZADO');
    }
    jest.spyOn(helpCatalog, 'scriptHash').mockReturnValue('f'.repeat(64));
    expect(videoStateOf(base)).toBe('DESATUALIZADO');
  });
});

describe('plano do seed', () => {
  // Aplica o plano num "banco" em memória, para conferir a idempotência.
  type Db = { folders: any[]; features: any[]; steps: any[] };
  function apply(db: Db, plan: ReturnType<typeof planSync>): Db {
    const out: Db = {
      folders: db.folders.map((f) => ({ ...f })),
      features: db.features.map((f) => ({ ...f })),
      steps: db.steps.filter((s) => !plan.stepDeletes.includes(s.id)).map((s) => ({ ...s })),
    };
    out.folders.push(...plan.folderCreates);
    out.features.push(...plan.featureCreates);
    out.steps.push(...plan.stepCreates);
    for (const u of plan.folderUpdates) Object.assign(out.folders.find((f) => f.id === u.id), u.data);
    for (const u of plan.featureUpdates) Object.assign(out.features.find((f) => f.id === u.id), u.data);
    for (const u of plan.stepUpdates) Object.assign(out.steps.find((s) => s.id === u.id), u.data);
    return out;
  }
  const vazio: Db = { folders: [], features: [], steps: [] };
  const totalAbas = catalogo.pastas.flatMap((p) => p.funcionalidades).reduce((s, f) => s + f.abas.length, 0);

  it('cria tudo na primeira vez, com as funcionalidades já publicadas', () => {
    const plan = planSync(catalogo, vazio as any);
    expect(plan.folderCreates).toHaveLength(catalogo.pastas.length);
    expect(plan.featureCreates).toHaveLength(catalogo.pastas.flatMap((p) => p.funcionalidades).length);
    expect(plan.stepCreates).toHaveLength(totalAbas);
    // Publicadas mesmo sem vídeo: os passos em texto já ensinam.
    expect(plan.featureCreates.every((f) => f.published === true)).toBe(true);
    expect(plan.stepCreates.every((s) => s.start_s === null)).toBe(true);
  });

  it('não muda nada na segunda vez, com ou sem textos', () => {
    const db = apply(vazio, planSync(catalogo, vazio as any));
    for (const options of [{}, { textos: true }]) {
      const again = planSync(catalogo, db as any, options);
      expect(Object.values(again).every((list) => list.length === 0)).toBe(true);
    }
  });

  it('preserva o trabalho do admin e nunca toca no vídeo', () => {
    const db = apply(vazio, planSync(catalogo, vazio as any));
    const feature = db.features.find((f) => f.slug === 'inspetor-historico');
    Object.assign(feature, {
      title: 'Título do admin',
      summary: 'Resumo do admin',
      order: 99,
      published: true,
      video_path: 'inspetor/inspetor-historico/u/video.mp4',
      video_script_hash: 'a'.repeat(64),
    });
    const step = db.steps.find((s) => s.feature_id === feature.id && s.order === 1);
    Object.assign(step, { body: 'Texto ajustado', start_s: 3.5 });

    const plan = planSync(catalogo, db as any);
    expect(plan.featureUpdates).toHaveLength(0);
    expect(plan.stepUpdates).toHaveLength(0);

    // Com `textos`, só título e texto voltam ao roteiro; o resto fica.
    const comTextos = planSync(catalogo, db as any, { textos: true });
    const f = comTextos.featureUpdates.find((u) => u.id === feature.id)!;
    expect(f.data).toEqual({ title: 'Histórico e relatório do dia' });
    const s = comTextos.stepUpdates.find((u) => u.id === step.id)!;
    expect(Object.keys(s.data).sort()).toEqual(['body', 'title']);
  });

  it('nunca publica de novo o que o admin despublicou, nem com textos', () => {
    const db = apply(vazio, planSync(catalogo, vazio as any));
    const feature = db.features.find((f) => f.slug === 'inspetor-historico');
    feature.published = false;
    for (const options of [{}, { textos: true }]) {
      const plan = planSync(catalogo, db as any, options);
      expect(plan.featureUpdates).toHaveLength(0);
      expect(plan.featureCreates).toHaveLength(0);
    }
    expect(apply(db, planSync(catalogo, db as any)).features.find((f) => f.slug === 'inspetor-historico').published).toBe(false);
  });

  it('remove a aba que saiu do roteiro e cria a que entrou', () => {
    const db = apply(vazio, planSync(catalogo, vazio as any));
    const feature = db.features.find((f) => f.slug === 'inspetor-historico');
    db.steps.push({ id: 'aba-extra', feature_id: feature.id, order: 99, title: 'x', body: 'x', start_s: null });
    db.steps = db.steps.filter((s) => !(s.feature_id === feature.id && s.order === 2));

    const plan = planSync(catalogo, db as any);
    expect(plan.stepDeletes).toEqual(['aba-extra']);
    expect(plan.stepCreates).toEqual([expect.objectContaining({ feature_id: feature.id, order: 2 })]);
  });

  it('o resumo inicial é a primeira frase da narração', () => {
    expect(resumoInicial('Seus dados ficam no Perfil. Na barra de baixo.')).toBe('Seus dados ficam no Perfil.');
    expect(resumoInicial('Sem ponto final')).toBe('Sem ponto final');
  });
});
