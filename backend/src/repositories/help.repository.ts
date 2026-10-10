import { FeedbackStatus, HelpDevice, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * O acesso ao banco da central de ajuda.
 *
 * Tudo que as rotas de `/help` e `/admin/help` tocam passa por aqui, inclusive
 * os vínculos da conta com os prédios (para o "Seu cargo") e o feedback do
 * "Isso ajudou?". Concentrar num repositório só é o que deixa as suítes de rota
 * mockarem um módulo e saberem que nenhuma consulta escapou para o banco.
 */

const STEPS_IN_ORDER = { orderBy: { order: 'asc' as const } };

const FEATURE_WITH_STEPS = {
  folder: true,
  steps: STEPS_IN_ORDER,
} satisfies Prisma.HelpFeatureInclude;

export type FeatureWithSteps = Prisma.HelpFeatureGetPayload<{ include: typeof FEATURE_WITH_STEPS }>;

const FEATURE_ADMIN = {
  folder: true,
  steps: STEPS_IN_ORDER,
  uploaded_by: { select: { id: true, name: true } },
} satisfies Prisma.HelpFeatureInclude;

export type FeatureAdmin = Prisma.HelpFeatureGetPayload<{ include: typeof FEATURE_ADMIN }>;

const TREE = {
  features: {
    orderBy: { order: 'asc' as const },
    include: { _count: { select: { steps: true } } },
  },
} satisfies Prisma.HelpFolderInclude;

export type FolderTree = Prisma.HelpFolderGetPayload<{ include: typeof TREE }>;

/** Uma linha da busca: a aba encontrada e onde ela mora. */
export type SearchRow = {
  folder_slug: string;
  folder_title: string;
  feature_slug: string;
  feature_title: string;
  step_order: number;
  step_title: string;
  step_body: string;
};

/** O que o commit de um vídeo grava, tudo numa transação. */
export type VideoCommit = {
  video_path: string;
  captions_path: string;
  poster_path: string;
  duration_s: number;
  video_script_hash: string;
  video_uploaded_by: string;
  starts: number[];
};

/** O que o seed pode mudar numa funcionalidade que já existe. Campo ausente fica como está. */
export type FeatureSyncUpdate = { folder_id?: string; device?: HelpDevice; title?: string };

/** O que o seed pode mudar numa aba que já existe: título e texto, sempre os dois. */
export type StepSyncUpdate = { title: string; body: string };

/** O plano do seed, já calculado: só escreve, não decide nada. */
export type SyncPlan = {
  folderCreates: Prisma.HelpFolderCreateManyInput[];
  folderUpdates: { id: string; data: Prisma.HelpFolderUpdateInput }[];
  featureCreates: Prisma.HelpFeatureCreateManyInput[];
  featureUpdates: { id: string; data: FeatureSyncUpdate }[];
  stepCreates: Prisma.HelpStepCreateManyInput[];
  stepUpdates: { id: string; data: StepSyncUpdate }[];
  stepDeletes: string[];
};

export const helpRepository = {
  // ── Leitura ──────────────────────────────────────────────────────────────

  /** As pastas, em ordem, com quantas funcionalidades publicadas cada uma tem. */
  async listFolders(includeAdminOnly: boolean) {
    return prisma.helpFolder.findMany({
      where: includeAdminOnly ? {} : { admin_only: false },
      orderBy: { order: 'asc' },
      include: { _count: { select: { features: { where: { published: true } } } } },
    });
  },

  /**
   * Uma pasta e as funcionalidades publicadas dela, em ordem, numa consulta
   * só: antes eram duas idas em série ao banco, e com o Render em Oregon e o
   * banco em São Paulo cada ida pesa.
   */
  findFolderWithPublishedFeatures(slug: string) {
    return prisma.helpFolder.findUnique({
      where: { slug },
      include: { features: { where: { published: true }, orderBy: { order: 'asc' } } },
    });
  },

  findFeatureBySlug(slug: string) {
    return prisma.helpFeature.findUnique({ where: { slug }, include: FEATURE_WITH_STEPS });
  },

  /**
   * Os papéis de prédio da conta comum, sem repetição.
   *
   * Só os papéis, e não os prédios: para o "Seu cargo" basta saber que a
   * pessoa é inspetora em algum lugar.
   */
  async userBuildingRoles(userId: string): Promise<string[]> {
    const rows = await prisma.buildingMember.findMany({
      where: { user_id: userId },
      select: { role: true },
      distinct: ['role'],
    });
    return rows.map((r) => r.role);
  },

  /**
   * A busca, nas abas de funcionalidades publicadas.
   *
   * `ILIKE` sobre título e texto da aba e título da funcionalidade, com os
   * acentos tirados dos dois lados pelo `translate`: quem digita "predio" acha
   * "prédio". Não usa a extensão `unaccent` porque ela não vem ligada no
   * Supabase nem no Postgres do CI, e ligar extensão é mais uma coisa a lembrar
   * em cada banco. Com cerca de 120 abas no catálogo, varrer a tabela custa
   * menos que manter um índice de texto.
   *
   * `pattern` já chega com os curingas escapados e os acentos tirados (ver
   * `helpService.search`). Só o `ESCAPE` e o `translate` moram aqui.
   */
  search(pattern: string, includeAdminOnly: boolean, limit: number): Promise<SearchRow[]> {
    const from = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
    const to = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
    return prisma.$queryRaw<SearchRow[]>`
      SELECT fo.slug AS folder_slug, fo.title AS folder_title,
             fe.slug AS feature_slug, fe.title AS feature_title,
             st."order" AS step_order, st.title AS step_title, st.body AS step_body
        FROM help_steps st
        JOIN help_features fe ON fe.id = st.feature_id
        JOIN help_folders fo ON fo.id = fe.folder_id
       WHERE fe.published = true
         AND (${includeAdminOnly}::boolean OR fo.admin_only = false)
         AND (translate(st.title, ${from}, ${to}) ILIKE ${pattern} ESCAPE '\\'
           OR translate(st.body, ${from}, ${to}) ILIKE ${pattern} ESCAPE '\\'
           OR translate(fe.title, ${from}, ${to}) ILIKE ${pattern} ESCAPE '\\')
       ORDER BY fo."order", fe."order", st."order"
       LIMIT ${limit}`;
  },

  /** A resposta desta conta ao "Isso ajudou?" desta funcionalidade, se houver. */
  findHelpFeedback(featureId: string, author: { user_id?: string; manager_id?: string }) {
    return prisma.feedback.findFirst({
      where: {
        help_feature_id: featureId,
        ...(author.manager_id ? { manager_id: author.manager_id } : { user_id: author.user_id }),
      },
      select: { id: true, helpful: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
  },

  createHelpFeedback(data: {
    user_id?: string;
    manager_id?: string;
    help_feature_id: string;
    helpful: boolean;
    message: string;
    status: FeedbackStatus;
  }) {
    return prisma.feedback.create({
      data,
      select: { id: true, helpful: true, created_at: true },
    });
  },

  // ── Admin ────────────────────────────────────────────────────────────────

  /** A árvore inteira, inclusive o que não está publicado. */
  tree(): Promise<FolderTree[]> {
    return prisma.helpFolder.findMany({ orderBy: { order: 'asc' }, include: TREE });
  },

  findFeatureForAdmin(id: string) {
    return prisma.helpFeature.findUnique({ where: { id }, include: FEATURE_ADMIN });
  },

  findFolderById(id: string) {
    return prisma.helpFolder.findUnique({ where: { id }, include: { features: { select: { id: true } } } });
  },

  findStepById(id: string) {
    return prisma.helpStep.findUnique({ where: { id }, include: { feature: true } });
  },

  /** Os ids das pastas, na ordem atual: a auditoria do reordenar guarda o antes. */
  listFolderIds() {
    return prisma.helpFolder.findMany({ select: { id: true }, orderBy: { order: 'asc' } });
  },

  updateFolder(id: string, data: { title?: string; description?: string }) {
    return prisma.helpFolder.update({ where: { id }, data });
  },

  updateFeature(id: string, data: { title?: string; summary?: string | null; published?: boolean }) {
    return prisma.helpFeature.update({ where: { id }, data });
  },

  /** Os arquivos de cada funcionalidade da lista: o lote confere quem existe e o que esquecer. */
  findFeaturesMedia(ids: string[]) {
    return prisma.helpFeature.findMany({
      where: { id: { in: ids } },
      select: { id: true, published: true, video_path: true, captions_path: true, poster_path: true },
    });
  },

  /**
   * Publica ou despublica a lista num UPDATE só. Só toca quem está no estado
   * oposto, então `count` é quantos mudaram de fato.
   */
  async setPublished(ids: string[], published: boolean): Promise<number> {
    const { count } = await prisma.helpFeature.updateMany({
      where: { id: { in: ids }, published: !published },
      data: { published },
    });
    return count;
  },

  updateStep(id: string, data: { title?: string; body?: string; start_s?: number | null }) {
    return prisma.helpStep.update({ where: { id }, data });
  },

  /** Grava a nova ordem: a posição na lista é a ordem, a partir de 1. */
  async reorderFolders(ids: string[]) {
    await prisma.$transaction(
      ids.map((id, i) => prisma.helpFolder.update({ where: { id }, data: { order: i + 1 } }))
    );
  },

  async reorderFeatures(ids: string[]) {
    await prisma.$transaction(
      ids.map((id, i) => prisma.helpFeature.update({ where: { id }, data: { order: i + 1 } }))
    );
  },

  /**
   * Grava o vídeo novo e os tempos das abas, numa transação.
   *
   * `expectedVideoPath` é o caminho que estava lá quando o commit começou. Se
   * outro commit da mesma funcionalidade terminou no meio do caminho, o
   * `updateMany` não acha a linha e nada é gravado: o chamador recebe `false`,
   * apaga os arquivos que acabou de mover e devolve conflito. Sem isto, os dois
   * commits apagariam os arquivos um do outro como "antigos".
   *
   * Os tempos das abas vão num UPDATE só (ver `startsUpdate`), e não num por
   * aba: com o Render em Oregon e o banco em São Paulo, oito abas em série
   * chegavam perto do teto padrão de 5 s da transação interativa. O teto
   * explícito de 15 s é a folga para um dia ruim da rede.
   */
  async commitVideo(featureId: string, expectedVideoPath: string | null, data: VideoCommit): Promise<boolean> {
    const { starts, ...video } = data;
    return prisma.$transaction(
      async (tx) => {
        const updated = await tx.helpFeature.updateMany({
          where: { id: featureId, video_path: expectedVideoPath },
          data: { ...video, video_uploaded_at: new Date() },
        });
        if (updated.count === 0) return false;
        if (starts.length) await tx.$executeRaw(startsUpdate(featureId, starts));
        return true;
      },
      { timeout: 15_000 }
    );
  },

  // ── Seed ─────────────────────────────────────────────────────────────────

  /** Tudo o que existe, no formato que o plano do seed compara. */
  async snapshot() {
    const [folders, features, steps] = await Promise.all([
      prisma.helpFolder.findMany(),
      prisma.helpFeature.findMany(),
      prisma.helpStep.findMany(),
    ]);
    return { folders, features, steps };
  },

  /**
   * Aplica o plano numa transação só.
   *
   * Criações em lote (`createMany`): na primeira carga são sete pastas, trinta
   * funcionalidades e cento e vinte abas, e uma ida ao banco por linha, com o
   * Render em Oregon e o banco em São Paulo, levaria meio minuto.
   *
   * Pelo mesmo motivo, as atualizações de funcionalidades e de abas (o
   * `textos: true` reescreve as cento e vinte abas de uma vez) vão cada uma
   * num UPDATE só, com a lista de mudanças em `VALUES` (ver `featuresUpdate` e
   * `stepsUpdate`). As pastas são no máximo sete e seguem uma a uma.
   */
  async applySync(plan: SyncPlan) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (plan.stepDeletes.length) ops.push(prisma.helpStep.deleteMany({ where: { id: { in: plan.stepDeletes } } }));
    if (plan.folderCreates.length) ops.push(prisma.helpFolder.createMany({ data: plan.folderCreates }));
    for (const u of plan.folderUpdates) ops.push(prisma.helpFolder.update({ where: { id: u.id }, data: u.data }));
    if (plan.featureCreates.length) ops.push(prisma.helpFeature.createMany({ data: plan.featureCreates }));
    if (plan.featureUpdates.length) ops.push(prisma.$executeRaw(featuresUpdate(plan.featureUpdates)));
    if (plan.stepCreates.length) ops.push(prisma.helpStep.createMany({ data: plan.stepCreates }));
    if (plan.stepUpdates.length) ops.push(prisma.$executeRaw(stepsUpdate(plan.stepUpdates)));
    if (ops.length) await prisma.$transaction(ops);
  },
};

// ── UPDATE em lote ──────────────────────────────────────────────────────────
//
// O Prisma não tem "update de várias linhas, cada uma com o seu valor": cada
// `update` é uma ida ao banco. Estes montam um UPDATE só, com as mudanças numa
// lista `VALUES` casada pela chave. Todo valor entra como parâmetro
// (`Prisma.sql` e `Prisma.join`), nunca colado no texto: nada aqui abre porta
// para injeção. O cast em cada valor fixa o tipo da coluna do `VALUES`.
//
// O `updated_at` vai à mão: quem preenche o `@updatedAt` é o cliente do
// Prisma, e SQL cru passa por fora dele.

/** Os tempos de início das abas de uma funcionalidade: a posição na lista é a ordem da aba, a partir de 1. */
export function startsUpdate(featureId: string, starts: number[]): Prisma.Sql {
  const rows = starts.map((s, i) => Prisma.sql`(${i + 1}::int, ${s}::double precision)`);
  return Prisma.sql`
    UPDATE "help_steps" AS st
       SET "start_s" = v.start_s, "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS v(ord, start_s)
     WHERE st."feature_id" = ${featureId} AND st."order" = v.ord`;
}

/** Título e texto de várias abas. */
export function stepsUpdate(updates: { id: string; data: StepSyncUpdate }[]): Prisma.Sql {
  const rows = updates.map((u) => Prisma.sql`(${u.id}::text, ${u.data.title}::text, ${u.data.body}::text)`);
  return Prisma.sql`
    UPDATE "help_steps" AS st
       SET "title" = v.title, "body" = v.body, "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS v(id, title, body)
     WHERE st."id" = v.id`;
}

/**
 * Pasta, dispositivo e título de várias funcionalidades. Cada linha muda só o
 * que veio: o campo ausente vai como nulo, e o `COALESCE` mantém o valor
 * atual. Nenhuma das três colunas aceita nulo, então nulo nunca quer dizer
 * "apagar".
 */
export function featuresUpdate(updates: { id: string; data: FeatureSyncUpdate }[]): Prisma.Sql {
  const rows = updates.map(
    (u) =>
      Prisma.sql`(${u.id}::text, ${u.data.folder_id ?? null}::text, ${u.data.device ?? null}::text, ${u.data.title ?? null}::text)`
  );
  return Prisma.sql`
    UPDATE "help_features" AS fe
       SET "folder_id" = COALESCE(v.folder_id, fe."folder_id"),
           "device" = COALESCE(v.device::"HelpDevice", fe."device"),
           "title" = COALESCE(v.title, fe."title"),
           "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(rows)}) AS v(id, folder_id, device, title)
     WHERE fe."id" = v.id`;
}
