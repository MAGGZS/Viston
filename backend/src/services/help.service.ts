import { randomUUID } from 'node:crypto';
import { AuditAction, FeedbackStatus, HelpFeature, HelpStep, Prisma } from '@prisma/client';
import { Actor } from '../middlewares/authenticate';
import { auditRepository, actorAudit } from '../repositories/building.repository';
import { FeatureAdmin, helpRepository } from '../repositories/help.repository';
import { userRepository } from '../repositories/user.repository';
import { logger } from '../lib/logger';
import { helpCatalog } from '../lib/helpCatalog';
import { helpStorage } from './helpStorage.service';
import { helpSeedService, SyncOptions } from './helpSeed.service';
import { AppError, ConflictError, ValidationError } from '../utils/errors';
import {
  checkCaptions,
  checkContentType,
  checkPoster,
  checkSize,
  checkVideo,
  PACKAGE_CONTENT_TYPES,
  PACKAGE_FILES,
  PACKAGE_LIMITS,
  PackageFile,
  PackageProblem,
  parseSteps,
} from '../utils/helpPackage';

/**
 * A central de ajuda: o que a pessoa lê em `/ajuda` e o que o admin faz em
 * `/desktop/admin/tutoriais`. O contrato de cada rota está em `tutoriais/API.md`.
 */

/**
 * 404 com a concordância certa. O `NotFoundError` comum escreve
 * "<entidade> não encontrado", e "Pasta não encontrado" chegaria assim na tela.
 */
const NOT_FOUND = {
  Pasta: 'Pasta não encontrada',
  Funcionalidade: 'Funcionalidade não encontrada',
  Aba: 'Aba não encontrada',
  Tutorial: 'Tutorial não encontrado',
} as const;

export function helpNotFound(what: keyof typeof NOT_FOUND) {
  return new AppError('NOT_FOUND', NOT_FOUND[what], 404);
}

/**
 * A situação do vídeo de uma funcionalidade. Calculada, nunca gravada.
 *
 * Separada da publicação de propósito: desde que o tutorial passou a valer
 * sem vídeo (os passos em texto já ensinam), "tem vídeo?" e "está no ar?" são
 * perguntas independentes, e a tela do admin mostra as duas lado a lado
 * (`published` e `video_state`).
 */
export type VideoState = 'SEM_VIDEO' | 'EM_DIA' | 'DESATUALIZADO';

/**
 * O vídeo sai de dois fatos: existe, e foi gravado com o roteiro de hoje.
 * Funcionalidade que saiu do roteiro (sem hash no catálogo) e tem vídeo é
 * DESATUALIZADO: o vídeo descreve algo que o roteiro não tem mais.
 *
 * Gravar isto numa coluna seria criar uma segunda verdade que envelhece
 * sozinha a cada deploy que muda o roteiro.
 */
export function videoStateOf(feature: Pick<HelpFeature, 'video_path' | 'video_script_hash' | 'slug'>): VideoState {
  if (!feature.video_path) return 'SEM_VIDEO';
  const current = helpCatalog.scriptHash(feature.slug);
  if (!current || feature.video_script_hash !== current) return 'DESATUALIZADO';
  return 'EM_DIA';
}

/**
 * O estado antigo, num campo só. Mantido para a tela do admin migrar sem
 * quebrar; o que vale daqui em diante é `published` mais `video_state`.
 *
 * Mistura as duas perguntas: SEM_VIDEO não diz se está no ar (e agora pode
 * estar), e DESATUALIZADO vence PUBLICADO e RASCUNHO.
 */
export type HelpState = 'SEM_VIDEO' | 'RASCUNHO' | 'PUBLICADO' | 'DESATUALIZADO';

export function stateOf(feature: Pick<HelpFeature, 'video_path' | 'published' | 'video_script_hash' | 'slug'>): HelpState {
  const video = videoStateOf(feature);
  if (video !== 'EM_DIA') return video;
  return feature.published ? 'PUBLICADO' : 'RASCUNHO';
}

/**
 * Os "cargos" da conta, no vocabulário de `HelpFolder.target_roles`.
 *
 * Gestor é `GESTOR`; admin é `ADMIN`; conta comum é cada papel que ela tem em
 * algum prédio, ou `SEM_PREDIO` quando ainda não tem nenhum. A lista completa
 * está documentada no mapa `PASTAS` de `tutoriais/scripts/catalogo.mjs`.
 */
async function accountRoles(actor: Actor, admin: boolean): Promise<Set<string>> {
  if (actor.kind === 'MANAGER') return new Set(['GESTOR']);
  if (admin) return new Set(['ADMIN']);
  const roles = await helpRepository.userBuildingRoles(actor.id);
  return new Set(roles.length ? roles : ['SEM_PREDIO']);
}

/**
 * A conta é ADMIN, confirmado no banco.
 *
 * O papel do token vale por quinze minutos, e um ADMIN rebaixado seguiria
 * vendo as pastas `admin_only`, achando-as na busca e recebendo URLs
 * assinadas dos vídeos delas até o token expirar. É a mesma conferência do
 * `authorize`, feita aqui porque `/help` não passa por ele. Só custa a consulta
 * quando o token diz ADMIN; para todo o resto a resposta sai do token.
 */
async function isAdmin(actor: Actor): Promise<boolean> {
  if (actor.kind !== 'USER' || actor.role !== 'ADMIN') return false;
  const account = await userRepository.findById(actor.id);
  return !!account && account.role === 'ADMIN' && account.status !== 'DELETED';
}

/** "Nenhuma conta respondeu duas vezes": o P2002 dos índices únicos parciais de `feedbacks`. */
function isDuplicate(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Antes e depois só dos campos que mudaram de fato, para a auditoria.
 *
 * Mandar o mesmo título de volta não é mudança, e registrar como se fosse
 * deixaria a trilha cheia de edições que não editaram nada.
 */
function diff(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]) {
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  for (const key of keys) {
    if (before[key] === after[key]) continue;
    antes[key] = before[key] ?? null;
    depois[key] = after[key] ?? null;
  }
  return { antes, depois };
}

/** Tira acento e caixa: é como a busca compara. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Um trecho do texto em volta do que foi achado, para a lista de resultados. */
function snippet(body: string, q: string, size = 160): string {
  const at = fold(body).indexOf(fold(q));
  if (body.length <= size) return body;
  const start = at <= 0 ? 0 : Math.max(0, at - Math.floor(size / 3));
  const piece = body.slice(start, start + size).trim();
  return `${start > 0 ? '…' : ''}${piece}${start + size < body.length ? '…' : ''}`;
}

function presentSteps(steps: HelpStep[]) {
  return steps.map((s) => ({ id: s.id, order: s.order, title: s.title, body: s.body, start_s: s.start_s }));
}

async function mediaUrls(feature: Pick<HelpFeature, 'video_path' | 'captions_path' | 'poster_path'>) {
  if (!feature.video_path) {
    return { video_url: null, captions_url: null, poster_url: null, urls_expire_at: null };
  }
  const { urls, expiresAt } = await helpStorage.signRead([
    feature.video_path,
    feature.captions_path,
    feature.poster_path,
  ]);
  return {
    video_url: urls[feature.video_path] ?? null,
    captions_url: feature.captions_path ? (urls[feature.captions_path] ?? null) : null,
    poster_url: feature.poster_path ? (urls[feature.poster_path] ?? null) : null,
    urls_expire_at: expiresAt ? expiresAt.toISOString() : null,
  };
}

async function presentAdminFeature(feature: FeatureAdmin) {
  return {
    id: feature.id,
    slug: feature.slug,
    title: feature.title,
    summary: feature.summary,
    device: feature.device,
    order: feature.order,
    published: feature.published,
    video_state: videoStateOf(feature),
    state: stateOf(feature),
    in_catalog: helpCatalog.scriptHash(feature.slug) !== null,
    catalog_script_hash: helpCatalog.scriptHash(feature.slug),
    video_script_hash: feature.video_script_hash,
    duration_s: feature.duration_s,
    video_uploaded_at: feature.video_uploaded_at,
    video_uploaded_by: feature.uploaded_by,
    folder: { id: feature.folder.id, slug: feature.folder.slug, title: feature.folder.title },
    ...(await mediaUrls(feature)),
    steps: presentSteps(feature.steps),
  };
}

async function findAdminFeature(id: string): Promise<FeatureAdmin> {
  const feature = await helpRepository.findFeatureForAdmin(id);
  if (!feature) throw helpNotFound('Funcionalidade');
  return feature;
}

/** `entityId` nulo é a ação sobre o conjunto, e não sobre um registro (a ordem das pastas). */
function audit(actor: Actor, entity: string, entityId: string | null, metadata: Record<string, unknown>) {
  return auditRepository.log({
    ...actorAudit(actor),
    action: AuditAction.UPDATE,
    entity,
    entity_id: entityId ?? undefined,
    metadata,
  });
}

/** Onde cada arquivo do pacote espera o commit: um diretório por envio. */
function tmpPath(featureId: string, uploadId: string, file: PackageFile) {
  return `tmp/${featureId}/${uploadId}/${file}`;
}

/**
 * Onde o arquivo fica depois do commit. O `uploadId` no caminho faz cada envio
 * ter URL própria: o vídeo novo nunca é servido pelo cache do vídeo antigo, e
 * o antigo pode ser apagado sem pressa depois.
 */
function finalPath(folderSlug: string, featureSlug: string, uploadId: string, file: PackageFile) {
  return `${folderSlug}/${featureSlug}/${uploadId}/${file}`;
}

/** Erro do pacote, com o arquivo em `details` para a tela marcar qual foi. */
function packageError(code: string, message: string, details: Record<string, unknown>) {
  return new AppError(code, message, 400, details);
}

/**
 * O banco já aponta para este vídeo? Usado só na limpeza de um commit que
 * falhou sem explicação. Se nem a releitura funciona, responde que sim: é o
 * lado que não apaga nada.
 */
async function dbPointsTo(featureId: string, videoPath: string): Promise<boolean> {
  try {
    const current = await helpRepository.findFeatureForAdmin(featureId);
    return current?.video_path === videoPath;
  } catch (err) {
    logger.error({ err, featureId }, '[Ajuda] Falha ao reler a funcionalidade depois de um commit com erro; os arquivos novos ficam');
    return true;
  }
}

/** Validade das URLs de upload, em segundos. É o prazo fixo do Supabase. */
const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;

/**
 * Idade a partir da qual um envio em `tmp/` é lixo: 24 horas. As URLs de
 * upload valem 2, então nenhum envio dessa idade ainda pode ser confirmado
 * com arquivos novos.
 */
const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Quantos resultados a busca devolve, no máximo. */
const SEARCH_LIMIT = 20;

export const helpService = {
  // ── Leitura ──────────────────────────────────────────────────────────────

  /**
   * As pastas que a conta enxerga, com `mine` marcando as do cargo dela.
   *
   * A ordem é a do admin; separar "Seu cargo" de "Outros cargos" é da tela,
   * pelo `mine`. Pasta sem nenhum tutorial publicado vem também, com
   * `feature_count: 0`: esconder ou não é decisão de apresentação.
   */
  async listFolders(actor: Actor) {
    const admin = await isAdmin(actor);
    const [folders, roles] = await Promise.all([
      helpRepository.listFolders(admin),
      accountRoles(actor, admin),
    ]);
    return {
      folders: folders.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        description: f.description,
        icon: f.icon,
        order: f.order,
        admin_only: f.admin_only,
        mine: (f.target_roles ?? []).some((r) => roles.has(r)),
        feature_count: f._count.features,
      })),
    };
  },

  /**
   * Uma pasta e as funcionalidades publicadas dela.
   *
   * Duas rodadas, e não três: a pasta já vem com as funcionalidades, e os
   * cargos da conta saem junto com a assinatura das capas. A assinatura só
   * começa depois de saber que a conta pode ver a pasta: URL de capa da pasta
   * do admin não sai para quem não é admin.
   */
  async getFolder(actor: Actor, slug: string) {
    const [folder, admin] = await Promise.all([
      helpRepository.findFolderWithPublishedFeatures(slug),
      isAdmin(actor),
    ]);
    // 404 também para a pasta do admin vista por quem não é admin: dizer
    // "existe, mas não é para você" não ajuda ninguém.
    if (!folder || (folder.admin_only && !admin)) throw helpNotFound('Pasta');

    const features = folder.features;
    const [roles, { urls }] = await Promise.all([
      accountRoles(actor, admin),
      helpStorage.signRead(features.map((f) => f.poster_path)),
    ]);

    return {
      folder: {
        id: folder.id,
        slug: folder.slug,
        title: folder.title,
        description: folder.description,
        icon: folder.icon,
        order: folder.order,
        admin_only: folder.admin_only,
        mine: (folder.target_roles ?? []).some((r) => roles.has(r)),
        feature_count: features.length,
      },
      features: features.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        summary: f.summary,
        device: f.device,
        order: f.order,
        duration_s: f.duration_s,
        poster_url: f.poster_path ? (urls[f.poster_path] ?? null) : null,
      })),
    };
  },

  /** Uma funcionalidade publicada, as abas e as URLs do vídeo, da legenda e da capa. */
  async getFeature(actor: Actor, slug: string) {
    const feature = await helpRepository.findFeatureBySlug(slug);
    if (!feature || !feature.published || (feature.folder.admin_only && !(await isAdmin(actor)))) {
      throw helpNotFound('Tutorial');
    }
    const author = actorAudit(actor);
    const [media, answer] = await Promise.all([
      mediaUrls(feature),
      helpRepository.findHelpFeedback(feature.id, author),
    ]);

    return {
      feature: {
        id: feature.id,
        slug: feature.slug,
        title: feature.title,
        summary: feature.summary,
        device: feature.device,
        duration_s: feature.duration_s,
        folder: { slug: feature.folder.slug, title: feature.folder.title },
        ...media,
        steps: presentSteps(feature.steps),
        my_feedback: answer ? { helpful: answer.helpful, created_at: answer.created_at } : null,
      },
    };
  },

  /**
   * Busca nas abas das funcionalidades publicadas.
   *
   * Cada resultado é uma aba, e leva a ela: a tela monta
   * `/ajuda/<pasta>/<funcionalidade>?passo=<ordem>`.
   */
  async search(actor: Actor, q: string) {
    const term = fold(q.trim());
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await helpRepository.search(pattern, await isAdmin(actor), SEARCH_LIMIT);
    return {
      results: rows.map((r) => ({
        folder_slug: r.folder_slug,
        folder_title: r.folder_title,
        feature_slug: r.feature_slug,
        feature_title: r.feature_title,
        step_order: Number(r.step_order),
        step_title: r.step_title,
        snippet: snippet(r.step_body, q.trim()),
      })),
    };
  },

  /**
   * O "Isso ajudou?": vira um feedback na caixa do admin, ligado ao tutorial.
   *
   * Uma resposta por conta e funcionalidade: a segunda é 409, e a tela sabe de
   * antemão pelo `my_feedback` do tutorial. Se o admin descartar a resposta, a
   * linha some e a pessoa pode responder de novo, o que é o comportamento
   * esperado de "descartar".
   *
   * A consulta antes de gravar dá a mensagem certa no caso comum; quem fecha a
   * porta de verdade são os índices únicos parciais da migration
   * `central_de_ajuda`. Dois cliques simultâneos passariam os dois pela
   * consulta, e o segundo `create` cai no P2002, que vira o mesmo 409.
   *
   * "Sim" sem comentário entra direto como MENSAGEM (lida, sem ação): é a
   * resposta mais comum e não pede nada, e entrar como PENDENTE enterraria os
   * feedbacks que pedem. "Não", ou qualquer resposta com comentário, entra
   * PENDENTE, como todo feedback novo.
   */
  async answerHelpful(actor: Actor, slug: string, helpful: boolean, comment?: string) {
    const feature = await helpRepository.findFeatureBySlug(slug);
    if (!feature || !feature.published || (feature.folder.admin_only && !(await isAdmin(actor)))) {
      throw helpNotFound('Tutorial');
    }
    const author = actorAudit(actor);
    const alreadyAnswered = () => new AppError('JA_RESPONDIDO', 'Você já respondeu sobre este tutorial.', 409);
    if (await helpRepository.findHelpFeedback(feature.id, author)) throw alreadyAnswered();

    const text = comment?.trim();
    const message =
      `Isso ajudou? ${helpful ? 'Sim' : 'Não'}. Tutorial "${feature.title}" (${feature.folder.title}).` +
      (text ? `\n\n${text}` : '');
    const status = helpful && !text ? FeedbackStatus.MENSAGEM : FeedbackStatus.PENDENTE;

    const feedback = await helpRepository
      .createHelpFeedback({ ...author, help_feature_id: feature.id, helpful, message, status })
      .catch((err: unknown) => {
        throw isDuplicate(err) ? alreadyAnswered() : err;
      });

    await auditRepository.log({
      ...author,
      action: AuditAction.CREATE,
      entity: 'Feedback',
      entity_id: feedback.id,
      metadata: { help_feature: feature.slug, helpful },
    });

    return { feedback };
  },

  // ── Admin ────────────────────────────────────────────────────────────────

  /**
   * A árvore inteira, com a publicação e o vídeo de cada funcionalidade e as
   * contagens do topo da tela.
   *
   * `published_counts` e `video_counts` somam, cada um, o `total`: são dois
   * cortes independentes da mesma lista. `counts` é o corte antigo pelo
   * `state`, mantido enquanto a tela migra.
   */
  async tree() {
    const folders = await helpRepository.tree();
    const counts: Record<HelpState, number> = { SEM_VIDEO: 0, RASCUNHO: 0, PUBLICADO: 0, DESATUALIZADO: 0 };
    const videoCounts: Record<VideoState, number> = { SEM_VIDEO: 0, EM_DIA: 0, DESATUALIZADO: 0 };
    const publishedCounts = { published: 0, unpublished: 0 };

    const out = folders.map((folder) => ({
      id: folder.id,
      slug: folder.slug,
      title: folder.title,
      description: folder.description,
      icon: folder.icon,
      order: folder.order,
      target_roles: folder.target_roles ?? [],
      admin_only: folder.admin_only,
      features: folder.features.map((f) => {
        const state = stateOf(f);
        const videoState = videoStateOf(f);
        counts[state] += 1;
        videoCounts[videoState] += 1;
        publishedCounts[f.published ? 'published' : 'unpublished'] += 1;
        return {
          id: f.id,
          slug: f.slug,
          title: f.title,
          summary: f.summary,
          device: f.device,
          order: f.order,
          published: f.published,
          video_state: videoState,
          state,
          in_catalog: helpCatalog.scriptHash(f.slug) !== null,
          step_count: f._count.steps,
          duration_s: f.duration_s,
          video_uploaded_at: f.video_uploaded_at,
        };
      }),
    }));

    return {
      total: publishedCounts.published + publishedCounts.unpublished,
      published_counts: publishedCounts,
      video_counts: videoCounts,
      counts,
      folders: out,
    };
  },

  async featureDetail(id: string) {
    return { feature: await presentAdminFeature(await findAdminFeature(id)) };
  },

  async updateFolder(id: string, data: { title?: string; description?: string }, actor: Actor) {
    const folder = await helpRepository.findFolderById(id);
    if (!folder) throw helpNotFound('Pasta');
    const updated = await helpRepository.updateFolder(id, data);
    const keys = Object.keys(data);
    await audit(actor, 'HelpFolder', id, { campos: keys, ...diff(folder, { ...folder, ...data }, keys) });
    return {
      folder: {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        description: updated.description,
        icon: updated.icon,
        order: updated.order,
        target_roles: updated.target_roles ?? [],
        admin_only: updated.admin_only,
      },
    };
  },

  /**
   * Reordena as pastas. A lista precisa ter todas, cada uma uma vez: ordem
   * parcial deixaria duas pastas na mesma posição.
   */
  async reorderFolders(ids: string[], actor: Actor) {
    const existing = (await helpRepository.listFolderIds()).map((f) => f.id);
    assertSameSet(ids, existing, 'pastas');
    await helpRepository.reorderFolders(ids);
    // Sem `entity_id`: a ação é sobre o conjunto das pastas, e não sobre uma.
    // O id da primeira da lista faria a reordenação parecer edição dela.
    await audit(actor, 'HelpFolder', null, { pastas_reordenadas: { antes: existing, depois: ids } });
    return this.tree();
  },

  async reorderFeatures(folderId: string, ids: string[], actor: Actor) {
    const folder = await helpRepository.findFolderById(folderId);
    if (!folder) throw helpNotFound('Pasta');
    assertSameSet(ids, folder.features.map((f) => f.id), 'funcionalidades desta pasta');
    await helpRepository.reorderFeatures(ids);
    await audit(actor, 'HelpFolder', folderId, {
      funcionalidades_reordenadas: { antes: folder.features.map((f) => f.id), depois: ids },
    });
    return this.tree();
  },

  async updateFeature(id: string, data: { title?: string; summary?: string | null }, actor: Actor) {
    const before = await findAdminFeature(id);
    await helpRepository.updateFeature(id, data);
    const keys = Object.keys(data);
    await audit(actor, 'HelpFeature', id, { campos: keys, ...diff(before, { ...before, ...data }, keys) });
    return this.featureDetail(id);
  },

  /**
   * Ajuste fino de uma aba. O tempo de início só existe com vídeo, e não pode
   * passar do fim dele.
   */
  async updateStep(id: string, data: { title?: string; body?: string; start_s?: number | null }, actor: Actor) {
    const step = await helpRepository.findStepById(id);
    if (!step) throw helpNotFound('Aba');

    if (data.start_s !== undefined && data.start_s !== null) {
      if (!step.feature.video_path) {
        throw new ConflictError('Esta funcionalidade ainda não tem vídeo. Envie o vídeo antes de ajustar os tempos.');
      }
      const duration = step.feature.duration_s;
      if (duration !== null && data.start_s >= duration) {
        throw new ValidationError(`O tempo de início precisa ser menor que a duração do vídeo (${duration} s).`);
      }
    }

    await helpRepository.updateStep(id, data);
    const keys = Object.keys(data);
    await audit(actor, 'HelpStep', id, {
      campos: keys,
      feature_id: step.feature_id,
      ...diff(step, { ...step, ...data }, keys),
    });
    return this.featureDetail(step.feature_id);
  },

  /**
   * As quatro URLs de upload do pacote, num diretório temporário novo.
   *
   * O `upload_id` volta no commit e é a única coisa que ele precisa: o caminho
   * é montado aqui dos dois lados, e o admin nunca escolhe onde grava.
   */
  async uploadUrls(id: string, actor: Actor) {
    const feature = await findAdminFeature(id);
    const uploadId = randomUUID();

    // Faxina do temporário: envio abandonado (o admin pediu as URLs e não
    // confirmou) deixaria arquivos em `tmp/` para sempre. Este é o momento em
    // que alguém está mexendo em vídeo, então é aqui que se varre o que passou
    // de 24 horas. Em segundo plano e sem derrubar nada: a resposta não
    // espera, e uma falha só vai para o log.
    void Promise.resolve()
      .then(() => helpStorage.cleanTmp(TMP_MAX_AGE_MS))
      .catch((err: unknown) => logger.error({ err }, '[Ajuda] Falha na faxina dos envios abandonados em tmp/'));

    const files: Record<string, { path: string; upload_url: string; token: string; content_type: string; max_bytes: number }> = {};
    for (const file of PACKAGE_FILES) {
      const path = tmpPath(feature.id, uploadId, file);
      const { signedUrl, token } = await helpStorage.createUploadUrl(path);
      files[file] = {
        path,
        upload_url: signedUrl,
        token,
        content_type: PACKAGE_CONTENT_TYPES[file],
        max_bytes: PACKAGE_LIMITS[file],
      };
    }

    await audit(actor, 'HelpFeature', id, { upload_iniciado: uploadId });
    return { upload_id: uploadId, expires_in: UPLOAD_URL_TTL_SECONDS, files };
  },

  /**
   * Confere o pacote enviado e o coloca no ar como vídeo da funcionalidade.
   *
   * A ordem é o que garante "falhou, os antigos ficam":
   *   1. confere tudo (existência, tamanho, tipo real, legenda, passos.json,
   *      se o pacote é desta funcionalidade e se tem o mesmo número de abas)
   *      sem tocar no que está publicado;
   *   2. move os arquivos novos do temporário para o caminho definitivo, que é
   *      novo a cada envio e não colide com os antigos;
   *   3. grava caminhos e tempos das abas numa transação;
   *   4. só então apaga os antigos e o resto do temporário.
   * Qualquer falha em 1 a 3 apaga os novos (temporários e já movidos) e deixa
   * o banco e os arquivos antigos como estavam. A exceção é o erro inesperado
   * depois que a transação pode ter gravado: aí o banco é relido, e se ele já
   * aponta para os novos, eles ficam (ver o `catch`). Falha em 4 só deixa lixo
   * no bucket, registrado no log. Toda recusa vai para a auditoria com o
   * código e o `upload_id`.
   *
   * A especificação lista "grava, move, apaga". Aqui o mover vem antes do
   * gravar para que o banco nunca aponte para um arquivo que ainda não existe:
   * na ordem da especificação, quem abrisse o tutorial no meio do commit
   * receberia 404 do vídeo.
   */
  async commit(id: string, uploadId: string, actor: Actor) {
    const feature = await findAdminFeature(id);

    // O mesmo `upload_id` duas vezes: o segundo commit acharia o temporário
    // vazio e responderia "pacote incompleto", o que manda o admin reenviar
    // algo que já está no ar. E se o temporário tivesse sido preenchido de
    // novo, o `move` gravaria por cima do vídeo publicado, no mesmo caminho.
    // Fora do `try` de propósito: nada aqui é deste envio para apagar.
    if (feature.video_path?.includes(`/${uploadId}/`)) {
      throw new AppError(
        'UPLOAD_JA_CONFIRMADO',
        'Este envio já foi confirmado e é o vídeo atual desta funcionalidade. Para trocar o vídeo, peça novas URLs de envio.',
        409
      );
    }

    const tmp = (file: PackageFile) => tmpPath(feature.id, uploadId, file);
    const dest = (file: PackageFile) => finalPath(feature.folder.slug, feature.slug, uploadId, file);
    const moved: string[] = [];

    try {
      // 1a. Os quatro existem, cabem no limite e foram gravados com o tipo
      // certo, antes de baixar qualquer um.
      for (const file of PACKAGE_FILES) {
        const info = await helpStorage.info(tmp(file));
        if (info === null) {
          throw packageError('PACOTE_INCOMPLETO', `Falta o arquivo ${file} no pacote enviado.`, { arquivo: file });
        }
        checkSize(file, info.size);
        checkContentType(file, info.contentType);
      }

      // 1b. O passos.json primeiro: se o pacote é de outra funcionalidade, é
      // isso que o admin precisa saber, e não que o vídeo tem um codec errado.
      const steps = parseSteps(await helpStorage.download(tmp('passos.json')));

      if (steps.pasta !== feature.folder.slug || steps.id !== feature.slug) {
        const right = await helpRepository.findFeatureBySlug(steps.id);
        const here = `"${feature.title}" (${feature.folder.title})`;
        throw right
          ? packageError(
              'PACOTE_DE_OUTRA_FUNCIONALIDADE',
              `Este pacote é da funcionalidade "${right.title}", na pasta ${right.folder.title}, e não de ${here}. Abra "${right.title}" e envie o pacote por lá.`,
              { arquivo: 'passos.json', pasta: right.folder.slug, id: right.slug, titulo: right.title, feature_id: right.id }
            )
          : packageError(
              'PACOTE_DE_OUTRA_FUNCIONALIDADE',
              `Este pacote é de "${steps.pasta}/${steps.id}", que não existe na central. A funcionalidade escolhida é "${feature.folder.slug}/${feature.slug}".`,
              { arquivo: 'passos.json', pasta: steps.pasta, id: steps.id, titulo: null, feature_id: null }
            );
      }

      if (steps.abas.length !== feature.steps.length) {
        throw packageError(
          'ABAS_DIFERENTES',
          `O pacote tem ${steps.abas.length} abas e "${feature.title}" tem ${feature.steps.length}. O roteiro mudou depois da gravação? Gere o pacote de novo.`,
          { arquivo: 'passos.json', no_pacote: steps.abas.length, na_funcionalidade: feature.steps.length }
        );
      }

      // 1c. O conteúdo de cada arquivo, pelos bytes.
      checkVideo(await helpStorage.download(tmp('video.mp4')));
      checkPoster(await helpStorage.download(tmp('capa.jpg')));
      checkCaptions(await helpStorage.download(tmp('legenda.vtt')));

      // 2. Para o definitivo.
      for (const file of ['video.mp4', 'legenda.vtt', 'capa.jpg'] as const) {
        await helpStorage.move(tmp(file), dest(file));
        moved.push(dest(file));
      }

      // 3. O banco, numa transação, só se ninguém trocou o vídeo no meio.
      const ok = await helpRepository.commitVideo(feature.id, feature.video_path, {
        video_path: dest('video.mp4'),
        captions_path: dest('legenda.vtt'),
        poster_path: dest('capa.jpg'),
        duration_s: steps.duracao_s,
        video_script_hash: steps.script_hash,
        video_uploaded_by: actor.id,
        starts: steps.abas.map((a) => a.inicio_s),
      });
      if (!ok) {
        throw new ConflictError('Outro envio para esta funcionalidade terminou primeiro. Recarregue a tela e confira.');
      }
    } catch (err) {
      // Erro conhecido (pacote recusado, conflito) é decisão nossa: o banco
      // com certeza não foi gravado. Erro inesperado pode ter vindo depois do
      // COMMIT da transação (a conexão caiu na volta, por exemplo), e aí o
      // banco já aponta para os arquivos novos: apagá-los quebraria o vídeo
      // publicado. Na dúvida, inclusive se nem a releitura funcionar, os
      // movidos ficam; arquivo sobrando é lixo, arquivo faltando é defeito.
      const known = err instanceof PackageProblem || err instanceof AppError;
      const keepMoved = !known && moved.length > 0 && (await dbPointsTo(feature.id, dest('video.mp4')));
      await helpStorage.remove([...PACKAGE_FILES.map(tmp), ...(keepMoved ? [] : moved)]);

      const refused = err instanceof PackageProblem ? packageError('PACOTE_INVALIDO', err.message, { arquivo: err.file }) : err;
      await audit(actor, 'HelpFeature', feature.id, {
        commit_recusado: refused instanceof AppError ? refused.code : 'ERRO_INTERNO',
        upload_id: uploadId,
      });
      throw refused;
    }

    // 4. Só agora os antigos saem.
    await helpStorage.remove([
      tmp('passos.json'),
      ...[feature.video_path, feature.captions_path, feature.poster_path].filter((p): p is string => !!p),
    ]);

    await audit(actor, 'HelpFeature', feature.id, {
      video_enviado: uploadId,
      substituiu: feature.video_path,
    });

    return this.featureDetail(feature.id);
  },

  /**
   * Publica. Não exige vídeo: os passos em texto já são o tutorial, e o vídeo,
   * quando chegar, aparece no topo da mesma página.
   */
  async publish(id: string, actor: Actor) {
    const feature = await findAdminFeature(id);
    if (!feature.published) {
      await helpRepository.updateFeature(id, { published: true });
      await audit(actor, 'HelpFeature', id, { published: true });
    }
    return this.featureDetail(id);
  },

  /**
   * Despublica e esquece as URLs assinadas guardadas do vídeo, da legenda e da
   * capa. Link já entregue vale até expirar (URL assinada não se revoga); o
   * que muda é que nenhuma resposta nova reaproveita aquele link, nem depois
   * de publicar de novo.
   */
  async unpublish(id: string, actor: Actor) {
    const feature = await findAdminFeature(id);
    if (feature.published) {
      await helpRepository.updateFeature(id, { published: false });
      await audit(actor, 'HelpFeature', id, { published: false });
    }
    helpStorage.forget([feature.video_path, feature.captions_path, feature.poster_path]);
    return this.featureDetail(id);
  },


  /**
   * Publica ou despublica vários tutoriais de uma vez, pela seleção da árvore.
   *
   * Id que não existe recusa o lote inteiro (404 com os ids em `details`): a
   * tela estava desatualizada, e gravar só uma parte deixaria o admin achando
   * que foi tudo. O UPDATE é um só, e só conta quem mudou de fato; quem já
   * estava no estado pedido fica como está, sem erro.
   *
   * Despublicar esquece as URLs assinadas guardadas dos três arquivos de cada
   * um, como o despublicar individual.
   */
  async publishBatch(ids: string[], published: boolean, actor: Actor) {
    const found = await helpRepository.findFeaturesMedia(ids);
    const known = new Set(found.map((f) => f.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) {
      throw new AppError('NOT_FOUND', 'Algum dos tutoriais escolhidos não existe mais. Recarregue a tela e escolha de novo.', 404, { ids: missing });
    }

    const updated = await helpRepository.setPublished(ids, published);
    if (!published) {
      helpStorage.forget(found.flatMap((f) => [f.video_path, f.captions_path, f.poster_path]));
    }
    await audit(actor, 'HelpFeature', null, { publicacao_em_lote: { ids, published, alterados: updated } });
    return { updated };
  },

  /** O seed, pela tela: o Render gratuito não tem shell para rodar o script. */
  async sync(options: SyncOptions, actor: Actor) {
    const summary = await helpSeedService.sync(options);
    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.UPDATE,
      entity: 'HelpCatalog',
      metadata: { ...summary, textos: !!options.textos },
    });
    return summary;
  },
};

function assertSameSet(ids: string[], expected: string[], what: string) {
  const a = new Set(ids);
  const b = new Set(expected);
  if (a.size !== ids.length || a.size !== b.size || [...a].some((x) => !b.has(x))) {
    throw new ValidationError(`A nova ordem precisa listar todas as ${what}, cada uma uma vez.`);
  }
}
