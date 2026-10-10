import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// Os repositórios e o bucket saem de cena: o alvo aqui é a cadeia das rotas
// (sessão, guarda de ADMIN, validação), quem enxerga o quê, e a ordem do
// commit do pacote. O bucket vira um Map em memória, que é o que deixa
// conferir "os antigos ficam quando o commit falha" olhando o que sobrou nele.
jest.mock('../repositories/help.repository');
jest.mock('../services/helpStorage.service');
// A guarda de ADMIN confere a conta no banco a cada requisição.
jest.mock('../repositories/user.repository');
jest.mock('../repositories/plan.repository');

import app from '../app';
import { helpRepository } from '../repositories/help.repository';
import { helpStorage } from '../services/helpStorage.service';
import { auditRepository } from '../repositories/building.repository';
import { userRepository } from '../repositories/user.repository';
import { helpCatalog } from '../lib/helpCatalog';
import { signAccessToken } from '../utils/jwt';
import { PACKAGE_CONTENT_TYPES, PackageFile } from '../utils/helpPackage';

const repo = helpRepository as jest.Mocked<typeof helpRepository>;
const storage = helpStorage as jest.Mocked<typeof helpStorage>;

const ADMIN_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const USER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const MANAGER_ID = 'cccccccc-3333-4333-8333-333333333333';
const FEATURE_ID = 'dddddddd-4444-4444-8444-444444444444';
const OTHER_FEATURE_ID = 'eeeeeeee-5555-4555-8555-555555555555';
const UPLOAD_ID = 'ffffffff-6666-4666-8666-666666666666';

const tokenAdmin = signAccessToken(ADMIN_ID, 'ADMIN', 'USER');
const tokenUser = signAccessToken(USER_ID, 'NONE', 'USER');
const tokenManager = signAccessToken(MANAGER_ID, 'NONE', 'MANAGER');

const EXEMPLO = path.resolve(__dirname, '..', '..', '..', 'tutoriais', 'exemplo');
const exemplo = (arquivo: string) => readFileSync(path.join(EXEMPLO, arquivo));

function folder(slug: string, target_roles: string[], admin_only = false, count = 1) {
  return {
    id: `id-${slug}`,
    slug,
    title: slug,
    description: `Pasta ${slug}`,
    icon: 'Rocket',
    order: 1,
    target_roles,
    admin_only,
    created_at: new Date(),
    updated_at: new Date(),
    _count: { features: count },
  };
}

const FOLDERS = [
  folder('primeiros-passos', ['SEM_PREDIO']),
  folder('gestor', ['GESTOR']),
  folder('inspetor', ['INSPECTOR']),
  folder('pasta-restrita', ['ADMIN'], true),
];

const PASTA_PP = { id: 'id-pp', slug: 'primeiros-passos', title: 'Primeiros passos', admin_only: false };

function step(order: number, extra = {}) {
  return {
    id: `step-${order}`,
    feature_id: FEATURE_ID,
    order,
    title: `Aba ${order}`,
    body: `Texto ${order}`,
    start_s: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...extra,
  };
}

/** A funcionalidade do pacote de exemplo, já com um vídeo antigo no ar. */
function feature(overrides: Record<string, unknown> = {}) {
  return {
    id: FEATURE_ID,
    folder_id: PASTA_PP.id,
    slug: 'primeiros-passos-entrar-codigo',
    title: 'Entrar em um prédio pelo código',
    summary: 'Resumo',
    device: 'MOBILE',
    order: 3,
    published: true,
    video_path: 'primeiros-passos/primeiros-passos-entrar-codigo/antigo/video.mp4',
    captions_path: 'primeiros-passos/primeiros-passos-entrar-codigo/antigo/legenda.vtt',
    poster_path: 'primeiros-passos/primeiros-passos-entrar-codigo/antigo/capa.jpg',
    duration_s: 12,
    video_script_hash: helpCatalog.scriptHash('primeiros-passos-entrar-codigo'),
    video_uploaded_at: new Date(),
    video_uploaded_by: ADMIN_ID,
    created_at: new Date(),
    updated_at: new Date(),
    folder: PASTA_PP,
    uploaded_by: { id: ADMIN_ID, name: 'Suporte' },
    steps: [step(1), step(2), step(3)],
    ...overrides,
  } as any;
}

// ── O bucket em memória ──────────────────────────────────────────────────────
let bucket: Map<string, Buffer>;
/** O `Content-Type` gravado, quando o teste quer um diferente do contrato. */
let tipos: Map<string, string | null>;
const tipoDoContrato = (p: string) => PACKAGE_CONTENT_TYPES[p.split('/').pop() as PackageFile] ?? null;
const tmp = (file: string) => `tmp/${FEATURE_ID}/${UPLOAD_ID}/${file}`;
const final = (file: string) => `primeiros-passos/primeiros-passos-entrar-codigo/${UPLOAD_ID}/${file}`;
const ANTIGOS = ['video.mp4', 'legenda.vtt', 'capa.jpg'].map(
  (f) => `primeiros-passos/primeiros-passos-entrar-codigo/antigo/${f}`
);

function enviarPacote(substituir: Partial<Record<string, Buffer>> = {}) {
  for (const file of ['video.mp4', 'legenda.vtt', 'capa.jpg', 'passos.json']) {
    bucket.set(tmp(file), substituir[file] ?? exemplo(file));
  }
}

function passosCom(mudar: Record<string, unknown>) {
  const base = JSON.parse(exemplo('passos.json').toString('utf8'));
  return Buffer.from(JSON.stringify({ ...base, ...mudar }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (auditRepository.log as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  (userRepository.findById as jest.Mock).mockImplementation(async (id: string) =>
    id === ADMIN_ID ? { id, role: 'ADMIN', status: 'ACTIVE' } : { id, role: 'NONE', status: 'ACTIVE' }
  );

  bucket = new Map(ANTIGOS.map((p) => [p, Buffer.from('antigo')]));
  tipos = new Map();
  storage.info.mockImplementation(async (p) =>
    bucket.has(p) ? { size: bucket.get(p)!.length, contentType: tipos.has(p) ? tipos.get(p)! : tipoDoContrato(p) } : null
  );
  storage.download.mockImplementation(async (p) => {
    if (!bucket.has(p)) throw new Error(`não existe ${p}`);
    return bucket.get(p)!;
  });
  storage.move.mockImplementation(async (from, to) => {
    bucket.set(to, bucket.get(from)!);
    bucket.delete(from);
  });
  storage.remove.mockImplementation(async (paths) => {
    paths.forEach((p) => bucket.delete(p));
  });
  storage.signRead.mockImplementation(async (paths) => ({
    urls: Object.fromEntries(paths.filter((p): p is string => !!p).map((p) => [p, `https://assinada/${p}`])),
    expiresAt: new Date('2026-10-09T16:00:00Z'),
  }));
  storage.createUploadUrl.mockImplementation(async (p) => ({ signedUrl: `https://upload/${p}`, token: 'tok' }));

  repo.findFeatureForAdmin.mockResolvedValue(feature());
  repo.commitVideo.mockResolvedValue(true);
  repo.userBuildingRoles.mockResolvedValue([]);
  repo.listFolders.mockImplementation(async (includeAdmin) =>
    FOLDERS.filter((f) => includeAdmin || !f.admin_only) as any
  );
});

// ── Sessão e guarda de ADMIN ─────────────────────────────────────────────────
describe('acesso', () => {
  it.each([
    ['get', '/help/folders'],
    ['get', '/help/folders/inspetor'],
    ['get', '/help/features/inspetor-historico'],
    ['get', '/help/search?q=predio'],
    ['get', '/admin/help/tree'],
    ['post', `/admin/help/features/${FEATURE_ID}/video/commit`],
  ])('%s %s sem sessão responde 401', async (method, url) => {
    const res = await (request(app) as any)[method](url);
    expect(res.status).toBe(401);
  });

  it.each([
    ['get', '/admin/help/tree'],
    ['get', `/admin/help/features/${FEATURE_ID}`],
    ['patch', `/admin/help/features/${FEATURE_ID}`],
    ['patch', '/admin/help/steps/' + FEATURE_ID],
    ['patch', '/admin/help/folders/order'],
    ['post', `/admin/help/features/${FEATURE_ID}/video/upload-urls`],
    ['post', `/admin/help/features/${FEATURE_ID}/video/commit`],
    ['post', `/admin/help/features/${FEATURE_ID}/publish`],
    ['post', `/admin/help/features/${FEATURE_ID}/unpublish`],
    ['post', '/admin/help/features/publish-batch'],
    ['post', '/admin/help/sync'],
  ])('%s %s responde 403 para conta comum e para gestor', async (method, url) => {
    for (const token of [tokenUser, tokenManager]) {
      const res = await (request(app) as any)[method](url).set('Authorization', `Bearer ${token}`).send({});
      expect(res.status).toBe(403);
    }
    expect(repo.tree).not.toHaveBeenCalled();
    expect(repo.commitVideo).not.toHaveBeenCalled();
  });

  it('ADMIN rebaixado no banco perde o acesso mesmo com o token antigo', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue({ id: ADMIN_ID, role: 'NONE', status: 'ACTIVE' });
    const res = await request(app).get('/admin/help/tree').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(403);
  });
});

// ── Pastas por cargo ─────────────────────────────────────────────────────────
describe('GET /help/folders', () => {
  const mine = (res: request.Response) =>
    Object.fromEntries(res.body.folders.map((f: { slug: string; mine: boolean }) => [f.slug, f.mine]));

  it('marca como "seu cargo" a pasta do papel que a conta tem em algum prédio', async () => {
    repo.userBuildingRoles.mockResolvedValue(['INSPECTOR']);
    const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(mine(res)).toEqual({ 'primeiros-passos': false, gestor: false, inspetor: true });
    expect(res.body.folders[0]).toEqual({
      id: 'id-primeiros-passos',
      slug: 'primeiros-passos',
      title: 'primeiros-passos',
      description: 'Pasta primeiros-passos',
      icon: 'Rocket',
      order: 1,
      admin_only: false,
      mine: false,
      feature_count: 1,
    });
  });

  it('conta comum sem prédio tem os primeiros passos como seu cargo', async () => {
    const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenUser}`);
    expect(mine(res)).toEqual({ 'primeiros-passos': true, gestor: false, inspetor: false });
  });

  it('gestor tem a pasta do gestor, sem consultar vínculo de usuário', async () => {
    const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenManager}`);
    expect(mine(res)).toEqual({ 'primeiros-passos': false, gestor: true, inspetor: false });
    expect(repo.userBuildingRoles).not.toHaveBeenCalled();
  });

  it('a pasta admin_only não aparece para quem não é ADMIN', async () => {
    for (const token of [tokenUser, tokenManager]) {
      const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${token}`);
      expect(res.body.folders.map((f: { slug: string }) => f.slug)).not.toContain('pasta-restrita');
    }
    expect(repo.listFolders).toHaveBeenCalledWith(false);
  });

  it('ADMIN vê a pasta admin_only como seu cargo', async () => {
    const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(repo.listFolders).toHaveBeenCalledWith(true);
    expect(mine(res)['pasta-restrita']).toBe(true);
  });
});

describe('GET /help/folders/:slug e /help/features/:slug', () => {
  it('a pasta admin_only é 404 para quem não é ADMIN', async () => {
    repo.findFolderWithPublishedFeatures.mockResolvedValue({
      ...folder('pasta-restrita', ['ADMIN'], true),
      features: [feature()],
    } as any);
    const res = await request(app).get('/help/folders/pasta-restrita').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(404);
    // Nenhuma capa da pasta do admin é assinada para quem não é admin.
    expect(storage.signRead).not.toHaveBeenCalled();
  });

  it('lista as funcionalidades publicadas da pasta, com a capa assinada', async () => {
    repo.findFolderWithPublishedFeatures.mockResolvedValue({
      ...folder('primeiros-passos', ['SEM_PREDIO']),
      features: [feature()],
    } as any);
    const res = await request(app).get('/help/folders/primeiros-passos').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(repo.findFolderWithPublishedFeatures).toHaveBeenCalledWith('primeiros-passos');
    expect(res.body.features[0]).toEqual({
      id: FEATURE_ID,
      slug: 'primeiros-passos-entrar-codigo',
      title: 'Entrar em um prédio pelo código',
      summary: 'Resumo',
      device: 'MOBILE',
      order: 3,
      duration_s: 12,
      poster_url: `https://assinada/${ANTIGOS[2]}`,
    });
  });

  it('funcionalidade publicada sem vídeo entra na pasta com capa e duração nulas', async () => {
    repo.findFolderWithPublishedFeatures.mockResolvedValue({
      ...folder('primeiros-passos', ['SEM_PREDIO']),
      features: [feature({ video_path: null, captions_path: null, poster_path: null, duration_s: null })],
    } as any);
    const res = await request(app).get('/help/folders/primeiros-passos').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(res.body.folder.feature_count).toBe(1);
    expect(res.body.features[0]).toMatchObject({ poster_url: null, duration_s: null });
  });

  it('funcionalidade publicada sem vídeo abre com URLs nulas e abas sem tempo', async () => {
    repo.findFeatureBySlug.mockResolvedValue(
      feature({
        video_path: null,
        captions_path: null,
        poster_path: null,
        duration_s: null,
        video_script_hash: null,
        video_uploaded_at: null,
        video_uploaded_by: null,
      })
    );
    repo.findHelpFeedback.mockResolvedValue(null);
    const res = await request(app)
      .get('/help/features/primeiros-passos-entrar-codigo')
      .set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(res.body.feature).toMatchObject({
      duration_s: null,
      video_url: null,
      captions_url: null,
      poster_url: null,
      urls_expire_at: null,
      my_feedback: null,
    });
    expect(res.body.feature.steps.map((s: { start_s: number | null }) => s.start_s)).toEqual([null, null, null]);
    expect(storage.signRead).not.toHaveBeenCalled();
  });

  it('slug fora do formato é 404 sem ir ao banco', async () => {
    const res = await request(app).get('/help/features/Nada%20Disso').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(404);
    expect(repo.findFeatureBySlug).not.toHaveBeenCalled();
  });

  it('funcionalidade não publicada é 404', async () => {
    repo.findFeatureBySlug.mockResolvedValue(feature({ published: false }));
    const res = await request(app)
      .get('/help/features/primeiros-passos-entrar-codigo')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
  });

  it('funcionalidade da pasta admin_only é 404 para quem não é ADMIN', async () => {
    repo.findFeatureBySlug.mockResolvedValue(
      feature({ folder: { ...PASTA_PP, slug: 'pasta-restrita', admin_only: true } })
    );
    const res = await request(app).get('/help/features/tutorial-restrito').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(404);
  });

  it('entrega abas, URLs assinadas e a resposta anterior ao "Isso ajudou?"', async () => {
    repo.findFeatureBySlug.mockResolvedValue(feature({ steps: [step(1, { start_s: 0 }), step(2, { start_s: 5 })] }));
    repo.findHelpFeedback.mockResolvedValue({ id: 'fb', helpful: true, created_at: new Date('2026-10-01') } as any);
    const res = await request(app)
      .get('/help/features/primeiros-passos-entrar-codigo')
      .set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(res.body.feature).toMatchObject({
      slug: 'primeiros-passos-entrar-codigo',
      folder: { slug: 'primeiros-passos', title: 'Primeiros passos' },
      video_url: `https://assinada/${ANTIGOS[0]}`,
      captions_url: `https://assinada/${ANTIGOS[1]}`,
      poster_url: `https://assinada/${ANTIGOS[2]}`,
      urls_expire_at: '2026-10-09T16:00:00.000Z',
      steps: [
        { id: 'step-1', order: 1, title: 'Aba 1', body: 'Texto 1', start_s: 0 },
        { id: 'step-2', order: 2, title: 'Aba 2', body: 'Texto 2', start_s: 5 },
      ],
      my_feedback: { helpful: true, created_at: '2026-10-01T00:00:00.000Z' },
    });
    expect(repo.findHelpFeedback).toHaveBeenCalledWith(FEATURE_ID, { user_id: USER_ID });
  });
});

// ── Busca ────────────────────────────────────────────────────────────────────
describe('GET /help/search', () => {
  const row = {
    folder_slug: 'primeiros-passos',
    folder_title: 'Primeiros passos',
    feature_slug: 'primeiros-passos-entrar-codigo',
    feature_title: 'Entrar em um prédio pelo código',
    step_order: 2,
    step_title: 'Digitar e enviar',
    step_body: 'Digite o código exatamente como recebeu e toque em Buscar.',
  };

  it('leva à aba encontrada, com acento e caixa ignorados', async () => {
    repo.search.mockResolvedValue([row]);
    const res = await request(app).get(`/help/search?q=${encodeURIComponent('CÓDIGO')}`).set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(200);
    expect(repo.search).toHaveBeenCalledWith('%codigo%', false, 20);
    expect(res.body.results).toEqual([
      {
        folder_slug: 'primeiros-passos',
        folder_title: 'Primeiros passos',
        feature_slug: 'primeiros-passos-entrar-codigo',
        feature_title: 'Entrar em um prédio pelo código',
        step_order: 2,
        step_title: 'Digitar e enviar',
        snippet: 'Digite o código exatamente como recebeu e toque em Buscar.',
      },
    ]);
  });

  it('busca da conta ADMIN inclui a pasta admin_only', async () => {
    repo.search.mockResolvedValue([]);
    await request(app).get('/help/search?q=painel').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(repo.search).toHaveBeenCalledWith('%painel%', true, 20);
  });

  it('curinga digitado é texto, não curinga', async () => {
    repo.search.mockResolvedValue([]);
    await request(app).get('/help/search?q=50%25_x').set('Authorization', `Bearer ${tokenUser}`);
    expect(repo.search).toHaveBeenCalledWith('%50\\%\\_x%', false, 20);
  });

  it('recusa busca com menos de 2 letras', async () => {
    const res = await request(app).get('/help/search?q=a').set('Authorization', `Bearer ${tokenUser}`);
    expect(res.status).toBe(400);
    expect(repo.search).not.toHaveBeenCalled();
  });
});

// ── Isso ajudou? ─────────────────────────────────────────────────────────────
describe('POST /help/features/:slug/feedback', () => {
  beforeEach(() => {
    repo.findFeatureBySlug.mockResolvedValue(feature());
    repo.findHelpFeedback.mockResolvedValue(null);
    repo.createHelpFeedback.mockResolvedValue({ id: 'fb-1', helpful: true, created_at: new Date() } as any);
  });

  it('"Sim" sem comentário entra como mensagem, ligado ao tutorial', async () => {
    const res = await request(app)
      .post('/help/features/primeiros-passos-entrar-codigo/feedback')
      .set('Authorization', `Bearer ${tokenManager}`)
      .send({ helpful: true });
    expect(res.status).toBe(201);
    expect(repo.createHelpFeedback).toHaveBeenCalledWith({
      manager_id: MANAGER_ID,
      help_feature_id: FEATURE_ID,
      helpful: true,
      message: 'Isso ajudou? Sim. Tutorial "Entrar em um prédio pelo código" (Primeiros passos).',
      status: 'MENSAGEM',
    });
  });

  it('"Não" entra pendente, com o comentário na mensagem', async () => {
    await request(app)
      .post('/help/features/primeiros-passos-entrar-codigo/feedback')
      .set('Authorization', `Bearer ${tokenUser}`)
      .send({ helpful: false, comment: 'O vídeo está rápido' });
    expect(repo.createHelpFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, helpful: false, status: 'PENDENTE' })
    );
    expect(repo.createHelpFeedback.mock.calls[0][0].message).toContain('O vídeo está rápido');
  });

  it('o teto é por conta: a 21ª resposta na hora é 429, e outra conta segue respondendo', async () => {
    // Contas próprias deste teste: o contador do limitador vive na memória do processo.
    const outra = signAccessToken('99999999-9999-4999-8999-999999999999', 'NONE', 'USER');
    const mais = signAccessToken('88888888-8888-4888-8888-888888888888', 'NONE', 'USER');
    const responder = (token: string) =>
      request(app)
        .post('/help/features/primeiros-passos-entrar-codigo/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ helpful: true });
    for (let i = 0; i < 20; i += 1) expect((await responder(outra)).status).toBe(201);
    const barrada = await responder(outra);
    expect(barrada.status).toBe(429);
    expect(barrada.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect((await responder(mais)).status).toBe(201);
  });

  it('a segunda resposta é recusada', async () => {
    repo.findHelpFeedback.mockResolvedValue({ id: 'fb', helpful: true, created_at: new Date() } as any);
    const res = await request(app)
      .post('/help/features/primeiros-passos-entrar-codigo/feedback')
      .set('Authorization', `Bearer ${tokenUser}`)
      .send({ helpful: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JA_RESPONDIDO');
    expect(repo.createHelpFeedback).not.toHaveBeenCalled();
  });
});

// ── Admin: árvore, estado e publicação ───────────────────────────────────────
describe('admin', () => {
  function tree(f: Record<string, unknown>) {
    return [
      {
        ...folder('primeiros-passos', ['SEM_PREDIO']),
        features: [{ ...feature(f), _count: { steps: 3 } }],
      },
    ] as any;
  }

  afterEach(() => jest.restoreAllMocks());

  it('a árvore mostra publicação e vídeo separados, e as contagens dos dois cortes', async () => {
    repo.tree.mockResolvedValue(tree({}));
    const res = await request(app).get('/admin/help/tree').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.published_counts).toEqual({ published: 1, unpublished: 0 });
    expect(res.body.video_counts).toEqual({ SEM_VIDEO: 0, EM_DIA: 1, DESATUALIZADO: 0 });
    expect(res.body.counts).toEqual({ SEM_VIDEO: 0, RASCUNHO: 0, PUBLICADO: 1, DESATUALIZADO: 0 });
    expect(res.body.folders[0].features[0]).toMatchObject({
      published: true,
      video_state: 'EM_DIA',
      state: 'PUBLICADO',
      in_catalog: true,
      step_count: 3,
    });
  });

  it('publicada sem vídeo conta como publicada e como SEM_VIDEO', async () => {
    repo.tree.mockResolvedValue([
      {
        ...folder('primeiros-passos', ['SEM_PREDIO']),
        features: [
          { ...feature({ video_path: null }), _count: { steps: 3 } },
          { ...feature({ id: OTHER_FEATURE_ID, video_path: null, published: false }), _count: { steps: 3 } },
        ],
      },
    ] as any);
    const res = await request(app).get('/admin/help/tree').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body.total).toBe(2);
    expect(res.body.published_counts).toEqual({ published: 1, unpublished: 1 });
    expect(res.body.video_counts).toEqual({ SEM_VIDEO: 2, EM_DIA: 0, DESATUALIZADO: 0 });
    expect(res.body.folders[0].features.map((f: { published: boolean; video_state: string }) => [f.published, f.video_state])).toEqual([
      [true, 'SEM_VIDEO'],
      [false, 'SEM_VIDEO'],
    ]);
  });

  it('a funcionalidade fica Desatualizada quando o hash do roteiro muda', async () => {
    repo.tree.mockResolvedValue(tree({}));
    jest.spyOn(helpCatalog, 'scriptHash').mockReturnValue('0'.repeat(64));
    const res = await request(app).get('/admin/help/tree').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body.folders[0].features[0]).toMatchObject({ video_state: 'DESATUALIZADO', state: 'DESATUALIZADO', published: true });
    expect(res.body.video_counts.DESATUALIZADO).toBe(1);
    expect(res.body.published_counts.published).toBe(1);
    expect(res.body.counts.DESATUALIZADO).toBe(1);
  });

  it('publicar sem vídeo é permitido: os passos em texto já são o tutorial', async () => {
    repo.findFeatureForAdmin.mockResolvedValue(feature({ video_path: null, captions_path: null, poster_path: null, published: false }));
    const res = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/publish`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(repo.updateFeature).toHaveBeenCalledWith(FEATURE_ID, { published: true });
    expect(res.body.feature).toMatchObject({ video_state: 'SEM_VIDEO', video_url: null });
  });

  it('publicar grava e audita', async () => {
    repo.findFeatureForAdmin.mockResolvedValue(feature({ published: false }));
    const res = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/publish`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(repo.updateFeature).toHaveBeenCalledWith(FEATURE_ID, { published: true });
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: ADMIN_ID, entity: 'HelpFeature', entity_id: FEATURE_ID })
    );
  });

  it('reordenar as pastas audita sem entity_id, com a ordem de antes e a de depois', async () => {
    repo.listFolderIds.mockResolvedValue([{ id: FEATURE_ID }, { id: OTHER_FEATURE_ID }]);
    repo.tree.mockResolvedValue([]);
    const res = await request(app)
      .patch('/admin/help/folders/order')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids: [OTHER_FEATURE_ID, FEATURE_ID] });
    expect(res.status).toBe(200);
    expect(repo.reorderFolders).toHaveBeenCalledWith([OTHER_FEATURE_ID, FEATURE_ID]);
    const call = (auditRepository.log as jest.Mock).mock.calls[0][0];
    expect(call).toMatchObject({
      entity: 'HelpFolder',
      metadata: { pastas_reordenadas: { antes: [FEATURE_ID, OTHER_FEATURE_ID], depois: [OTHER_FEATURE_ID, FEATURE_ID] } },
    });
    expect(call.entity_id).toBeUndefined();
  });

  it('reordenar exige a lista completa', async () => {
    repo.listFolderIds.mockResolvedValue([{ id: FEATURE_ID }, { id: OTHER_FEATURE_ID }]);
    const res = await request(app)
      .patch('/admin/help/folders/order')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids: [FEATURE_ID] });
    expect(res.status).toBe(400);
    expect(repo.reorderFolders).not.toHaveBeenCalled();
  });

  it('tempo de início além do fim do vídeo é recusado', async () => {
    repo.findStepById.mockResolvedValue({ ...step(2), feature: feature() } as any);
    const res = await request(app)
      .patch(`/admin/help/steps/${FEATURE_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ start_s: 30 });
    expect(res.status).toBe(400);
    expect(repo.updateStep).not.toHaveBeenCalled();
  });

  it('as URLs de upload vão para um diretório temporário da funcionalidade', async () => {
    const res = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/upload-urls`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.files)).toEqual(['video.mp4', 'legenda.vtt', 'capa.jpg', 'passos.json']);
    const uploadId = res.body.upload_id;
    expect(res.body.files['video.mp4']).toEqual({
      path: `tmp/${FEATURE_ID}/${uploadId}/video.mp4`,
      upload_url: `https://upload/tmp/${FEATURE_ID}/${uploadId}/video.mp4`,
      token: 'tok',
      content_type: 'video/mp4',
      max_bytes: 8 * 1024 * 1024,
    });
    // A faxina de tmp/ sai junto, com o corte de 24 horas.
    expect(storage.cleanTmp).toHaveBeenCalledWith(24 * 60 * 60 * 1000);
  });

  it('a faxina de tmp/ não segura a resposta nem a derruba', async () => {
    storage.cleanTmp.mockReturnValueOnce(new Promise(() => undefined));
    const lenta = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/upload-urls`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(lenta.status).toBe(201);

    storage.cleanTmp.mockRejectedValueOnce(new Error('Supabase fora do ar'));
    const falha = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/upload-urls`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(falha.status).toBe(201);
  });
});

// ── Commit do pacote ─────────────────────────────────────────────────────────
describe('POST /admin/help/features/:id/video/commit', () => {
  const commit = () =>
    request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/commit`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ upload_id: UPLOAD_ID });

  /** Os antigos continuam no bucket, nada do envio sobrou, e o banco não mudou. */
  function expectNothingChanged() {
    expect([...bucket.keys()].sort()).toEqual([...ANTIGOS].sort());
    expect(repo.commitVideo).not.toHaveBeenCalled();
  }

  it('grava o vídeo novo, os tempos das abas e só então apaga os antigos', async () => {
    enviarPacote();
    const res = await commit();
    expect(res.status).toBe(200);

    expect(repo.commitVideo).toHaveBeenCalledWith(FEATURE_ID, ANTIGOS[0], {
      video_path: final('video.mp4'),
      captions_path: final('legenda.vtt'),
      poster_path: final('capa.jpg'),
      duration_s: 15,
      video_script_hash: helpCatalog.scriptHash('primeiros-passos-entrar-codigo'),
      video_uploaded_by: ADMIN_ID,
      starts: [0, 5, 10],
    });
    expect([...bucket.keys()].sort()).toEqual([final('capa.jpg'), final('legenda.vtt'), final('video.mp4')]);
  });

  it('recusa pacote de outra funcionalidade e diz qual é a certa', async () => {
    repo.findFeatureBySlug.mockResolvedValue(
      feature({
        id: OTHER_FEATURE_ID,
        slug: 'inspetor-historico',
        title: 'Histórico e relatório do dia',
        folder: { ...PASTA_PP, slug: 'inspetor', title: 'Inspetor' },
      })
    );
    enviarPacote({ 'passos.json': passosCom({ pasta: 'inspetor', id: 'inspetor-historico' }) });

    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PACOTE_DE_OUTRA_FUNCIONALIDADE');
    expect(res.body.error.message).toContain('"Histórico e relatório do dia", na pasta Inspetor');
    expect(res.body.error.details).toMatchObject({
      pasta: 'inspetor',
      id: 'inspetor-historico',
      feature_id: OTHER_FEATURE_ID,
    });
    expectNothingChanged();
  });

  it('recusa pacote com número de abas diferente', async () => {
    repo.findFeatureForAdmin.mockResolvedValue(feature({ steps: [step(1), step(2), step(3), step(4)] }));
    enviarPacote();
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ABAS_DIFERENTES');
    expect(res.body.error.details).toEqual({ arquivo: 'passos.json', no_pacote: 3, na_funcionalidade: 4 });
    expectNothingChanged();
  });

  it('recusa vídeo com MIME falso', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
    enviarPacote({ 'video.mp4': png });
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'PACOTE_INVALIDO', details: { arquivo: 'video.mp4' } });
    expectNothingChanged();
  });

  it('recusa arquivo acima do limite sem baixá-lo', async () => {
    const capaGrande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(301 * 1024)]);
    enviarPacote({ 'capa.jpg': capaGrande });
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'PACOTE_INVALIDO', details: { arquivo: 'capa.jpg' } });
    expect(res.body.error.message).toContain('acima do limite de 300 KB');
    expect(storage.download).not.toHaveBeenCalled();
    expectNothingChanged();
  });

  it('recusa pacote com arquivo faltando', async () => {
    enviarPacote();
    bucket.delete(tmp('legenda.vtt'));
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'PACOTE_INCOMPLETO', details: { arquivo: 'legenda.vtt' } });
    expectNothingChanged();
  });

  it('mantém os antigos e apaga os novos quando a gravação no banco falha', async () => {
    enviarPacote();
    repo.commitVideo.mockRejectedValue(new Error('banco fora do ar'));
    const res = await commit();
    expect(res.status).toBe(500);
    expect([...bucket.keys()].sort()).toEqual([...ANTIGOS].sort());
  });

  it('devolve conflito, e mantém os antigos, quando outro envio terminou primeiro', async () => {
    enviarPacote();
    repo.commitVideo.mockResolvedValue(false);
    const res = await commit();
    expect(res.status).toBe(409);
    expect([...bucket.keys()].sort()).toEqual([...ANTIGOS].sort());
  });

  it('recusa upload_id que não é UUID', async () => {
    const res = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/commit`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ upload_id: '../../outro' });
    expect(res.status).toBe(400);
    expect(storage.info).not.toHaveBeenCalled();
  });
});

// ── Auditoria de segurança da central (SEC-01 a SEC-08) ──────────────────────
describe('"Isso ajudou?" em duas abas ao mesmo tempo', () => {
  it('o P2002 do índice único parcial vira o mesmo 409 da segunda resposta', async () => {
    repo.findFeatureBySlug.mockResolvedValue(feature());
    // As duas requisições passaram pela consulta antes de qualquer uma gravar.
    repo.findHelpFeedback.mockResolvedValue(null);
    repo.createHelpFeedback.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
    );
    const res = await request(app)
      .post('/help/features/primeiros-passos-entrar-codigo/feedback')
      .set('Authorization', `Bearer ${tokenUser}`)
      .send({ helpful: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JA_RESPONDIDO');
  });
});

describe('ADMIN rebaixado com o token antigo em /help', () => {
  beforeEach(() => {
    (userRepository.findById as jest.Mock).mockResolvedValue({ id: ADMIN_ID, role: 'NONE', status: 'ACTIVE' });
  });

  it('não vê a pasta admin_only na lista nem a tem como seu cargo', async () => {
    const res = await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(repo.listFolders).toHaveBeenCalledWith(false);
    expect(res.body.folders.map((f: { slug: string }) => f.slug)).not.toContain('pasta-restrita');
    expect(repo.userBuildingRoles).toHaveBeenCalledWith(ADMIN_ID);
  });

  it('a pasta e o tutorial da pasta admin_only são 404, sem URL assinada', async () => {
    repo.findFolderWithPublishedFeatures.mockResolvedValue({ ...folder('pasta-restrita', ['ADMIN'], true), features: [] } as any);
    const pasta = await request(app).get('/help/folders/pasta-restrita').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(pasta.status).toBe(404);

    repo.findFeatureBySlug.mockResolvedValue(
      feature({ folder: { ...PASTA_PP, slug: 'pasta-restrita', admin_only: true } })
    );
    const tutorial = await request(app).get('/help/features/tutorial-restrito').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(tutorial.status).toBe(404);
    expect(storage.signRead).not.toHaveBeenCalled();
  });

  it('a busca não inclui a pasta admin_only', async () => {
    repo.search.mockResolvedValue([]);
    await request(app).get('/help/search?q=painel').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(repo.search).toHaveBeenCalledWith('%painel%', false, 20);
  });

  it('conta comum e gestor não custam consulta de conta', async () => {
    await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenUser}`);
    await request(app).get('/help/folders').set('Authorization', `Bearer ${tokenManager}`);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });
});

describe('auditoria das edições do admin', () => {
  it('a funcionalidade registra antes e depois só do que mudou', async () => {
    const res = await request(app)
      .patch(`/admin/help/features/${FEATURE_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ title: 'Título novo', summary: 'Resumo' });
    expect(res.status).toBe(200);
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'HelpFeature',
        metadata: {
          campos: ['title', 'summary'],
          antes: { title: 'Entrar em um prédio pelo código' },
          depois: { title: 'Título novo' },
        },
      })
    );
  });

  it('a pasta e a aba também', async () => {
    repo.findFolderById.mockResolvedValue({ ...folder('primeiros-passos', ['SEM_PREDIO']), features: [] } as any);
    repo.updateFolder.mockResolvedValue({ ...folder('primeiros-passos', ['SEM_PREDIO']), description: 'Nova' } as any);
    await request(app)
      .patch('/admin/help/folders/' + FEATURE_ID)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ description: 'Nova' });
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'HelpFolder',
        metadata: expect.objectContaining({ antes: { description: 'Pasta primeiros-passos' }, depois: { description: 'Nova' } }),
      })
    );

    repo.findStepById.mockResolvedValue({ ...step(2, { start_s: 5 }), feature: feature() } as any);
    await request(app)
      .patch(`/admin/help/steps/${FEATURE_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ start_s: 6.5 });
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'HelpStep',
        metadata: expect.objectContaining({ antes: { start_s: 5 }, depois: { start_s: 6.5 } }),
      })
    );
  });

  it('tempo de início infinito é recusado na validação', async () => {
    const res = await request(app)
      .patch(`/admin/help/steps/${FEATURE_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .set('Content-Type', 'application/json')
      .send('{"start_s": 1e400}');
    expect(res.status).toBe(400);
    expect(repo.findStepById).not.toHaveBeenCalled();
  });

  it('despublicar esquece as URLs assinadas guardadas dos três arquivos', async () => {
    const res = await request(app)
      .post(`/admin/help/features/${FEATURE_ID}/unpublish`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(storage.forget).toHaveBeenCalledWith(ANTIGOS);
    // Esquece antes de assinar de novo para a resposta do admin.
    expect(storage.forget.mock.invocationCallOrder[0]).toBeLessThan(storage.signRead.mock.invocationCallOrder[0]);
  });
});

describe('commit do pacote: o que a auditoria de segurança pediu', () => {
  const commit = () =>
    request(app)
      .post(`/admin/help/features/${FEATURE_ID}/video/commit`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ upload_id: UPLOAD_ID });

  it('recusa arquivo gravado com o Content-Type errado, sem baixar nada', async () => {
    enviarPacote();
    tipos.set(tmp('capa.jpg'), 'text/html');
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'PACOTE_INVALIDO', details: { arquivo: 'capa.jpg' } });
    expect(storage.download).not.toHaveBeenCalled();
    expect([...bucket.keys()].sort()).toEqual([...ANTIGOS].sort());
  });

  it('recusa passos.json com duração infinita', async () => {
    const passos = exemplo('passos.json').toString('utf8').replace('"duracao_s": 15', '"duracao_s": 1e400');
    enviarPacote({ 'passos.json': Buffer.from(passos) });
    const res = await commit();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'PACOTE_INVALIDO', details: { arquivo: 'passos.json' } });
    expect(repo.commitVideo).not.toHaveBeenCalled();
  });

  it('registra a recusa na auditoria, com o código e o upload_id', async () => {
    enviarPacote();
    bucket.delete(tmp('video.mp4'));
    await commit();
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'HelpFeature',
        entity_id: FEATURE_ID,
        metadata: { commit_recusado: 'PACOTE_INCOMPLETO', upload_id: UPLOAD_ID },
      })
    );
  });

  it('o mesmo upload_id depois de confirmado é 409, sem tocar no bucket', async () => {
    repo.findFeatureForAdmin.mockResolvedValue(feature({ video_path: final('video.mp4') }));
    bucket.set(final('video.mp4'), Buffer.from('no ar'));
    const res = await commit();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UPLOAD_JA_CONFIRMADO');
    expect(storage.info).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(bucket.has(final('video.mp4'))).toBe(true);
  });

  it('erro inesperado depois de o banco gravar não apaga os arquivos novos', async () => {
    enviarPacote();
    // A transação gravou, mas a resposta não voltou (a conexão caiu na volta).
    repo.commitVideo.mockRejectedValue(new Error('Connection terminated'));
    repo.findFeatureForAdmin
      .mockResolvedValueOnce(feature())
      .mockResolvedValueOnce(feature({ video_path: final('video.mp4') }));
    const res = await commit();
    expect(res.status).toBe(500);
    for (const f of ['video.mp4', 'legenda.vtt', 'capa.jpg']) expect(bucket.has(final(f))).toBe(true);
    // Os temporários saem do mesmo jeito.
    expect(bucket.has(tmp('passos.json'))).toBe(false);
  });

  it('erro inesperado com o banco ainda no vídeo antigo apaga os novos', async () => {
    enviarPacote();
    repo.commitVideo.mockRejectedValue(new Error('banco fora do ar'));
    const res = await commit();
    expect(res.status).toBe(500);
    expect(repo.findFeatureForAdmin).toHaveBeenCalledTimes(2);
    expect([...bucket.keys()].sort()).toEqual([...ANTIGOS].sort());
  });

  it('se nem a releitura funciona, os arquivos novos ficam', async () => {
    enviarPacote();
    repo.commitVideo.mockRejectedValue(new Error('banco fora do ar'));
    repo.findFeatureForAdmin.mockResolvedValueOnce(feature()).mockRejectedValueOnce(new Error('ainda fora'));
    const res = await commit();
    expect(res.status).toBe(500);
    expect(bucket.has(final('video.mp4'))).toBe(true);
  });
});

// ── Publicação em lote ───────────────────────────────────────────────────────
describe('POST /admin/help/features/publish-batch', () => {
  const URL = '/admin/help/features/publish-batch';
  const midia = (id: string, published: boolean) => ({
    id,
    published,
    video_path: `p/${id}/video.mp4`,
    captions_path: `p/${id}/legenda.vtt`,
    poster_path: null,
  });

  it('conta comum e gestor recebem 403, e nada é gravado', async () => {
    for (const token of [tokenUser, tokenManager]) {
      const res = await request(app).post(URL).set('Authorization', `Bearer ${token}`).send({ ids: [FEATURE_ID], published: false });
      expect(res.status).toBe(403);
    }
    expect(repo.setPublished).not.toHaveBeenCalled();
  });

  it('ADMIN rebaixado no banco recebe 403 mesmo com o token antigo', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue({ id: ADMIN_ID, role: 'NONE', status: 'ACTIVE' });
    const res = await request(app).post(URL).set('Authorization', `Bearer ${tokenAdmin}`).send({ ids: [FEATURE_ID], published: true });
    expect(res.status).toBe(403);
    expect(repo.setPublished).not.toHaveBeenCalled();
  });

  it.each([
    ['sem ids', { published: true }],
    ['lista vazia', { ids: [], published: true }],
    ['id que não é UUID', { ids: ['abc'], published: true }],
    ['id repetido', { ids: [FEATURE_ID, FEATURE_ID], published: true }],
    ['mais de 100', { ids: Array.from({ length: 101 }, (_, i) => `dddddddd-4444-4444-8444-${String(i).padStart(12, '0')}`), published: true }],
    ['sem published', { ids: [FEATURE_ID] }],
    ['published que não é booleano', { ids: [FEATURE_ID], published: 'sim' }],
    ['campo a mais', { ids: [FEATURE_ID], published: true, folder_id: FEATURE_ID }],
  ])('recusa %s com 400', async (_nome, corpo) => {
    const res = await request(app).post(URL).set('Authorization', `Bearer ${tokenAdmin}`).send(corpo);
    expect(res.status).toBe(400);
    expect(repo.findFeaturesMedia).not.toHaveBeenCalled();
    expect(repo.setPublished).not.toHaveBeenCalled();
  });

  it('publica a lista num UPDATE só e audita os ids e o valor', async () => {
    repo.findFeaturesMedia.mockResolvedValue([midia(FEATURE_ID, false), midia(OTHER_FEATURE_ID, true)] as any);
    repo.setPublished.mockResolvedValue(1);
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids: [FEATURE_ID, OTHER_FEATURE_ID], published: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
    expect(repo.setPublished).toHaveBeenCalledTimes(1);
    expect(repo.setPublished).toHaveBeenCalledWith([FEATURE_ID, OTHER_FEATURE_ID], true);
    expect(repo.updateFeature).not.toHaveBeenCalled();
    expect(storage.forget).not.toHaveBeenCalled();
    expect(auditRepository.log).toHaveBeenCalledTimes(1);
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: ADMIN_ID,
        entity: 'HelpFeature',
        entity_id: undefined,
        metadata: { publicacao_em_lote: { ids: [FEATURE_ID, OTHER_FEATURE_ID], published: true, alterados: 1 } },
      })
    );
  });

  it('aceita o lote do tamanho do catálogo, com ids UUID v4 de verdade, pela cadeia inteira', async () => {
    // O formato dos ids do banco (v4, gerados pelo seed) e a quantidade que a
    // tela manda ao "Selecionar todos" com o catálogo inteiro.
    const ids = Array.from({ length: 28 }, () => randomUUID());
    repo.findFeaturesMedia.mockResolvedValue(ids.map((id) => midia(id, false)) as any);
    repo.setPublished.mockResolvedValue(28);
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids, published: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 28 });
    expect(repo.setPublished).toHaveBeenCalledWith(ids, true);
  });

  it('despublicar esquece as URLs assinadas guardadas de cada um', async () => {
    repo.findFeaturesMedia.mockResolvedValue([midia(FEATURE_ID, true), midia(OTHER_FEATURE_ID, true)] as any);
    repo.setPublished.mockResolvedValue(2);
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids: [FEATURE_ID, OTHER_FEATURE_ID], published: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect(repo.setPublished).toHaveBeenCalledWith([FEATURE_ID, OTHER_FEATURE_ID], false);
    expect(storage.forget).toHaveBeenCalledWith([
      `p/${FEATURE_ID}/video.mp4`, `p/${FEATURE_ID}/legenda.vtt`, null,
      `p/${OTHER_FEATURE_ID}/video.mp4`, `p/${OTHER_FEATURE_ID}/legenda.vtt`, null,
    ]);
  });

  it('id que não existe recusa o lote inteiro com 404, sem gravar nem auditar', async () => {
    repo.findFeaturesMedia.mockResolvedValue([midia(FEATURE_ID, true)] as any);
    const res = await request(app)
      .post(URL)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ids: [FEATURE_ID, OTHER_FEATURE_ID], published: false });

    expect(res.status).toBe(404);
    expect(res.body.error.details).toEqual({ ids: [OTHER_FEATURE_ID] });
    expect(repo.setPublished).not.toHaveBeenCalled();
    expect(auditRepository.log).not.toHaveBeenCalled();
  });
});
