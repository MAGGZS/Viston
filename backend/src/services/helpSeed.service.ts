import { randomUUID } from 'node:crypto';
import { HelpFeature, HelpFolder, HelpStep } from '@prisma/client';
import { Catalogo, catalogo as catalogoAtual } from '../lib/helpCatalog';
import { FeatureSyncUpdate, helpRepository, SyncPlan } from '../repositories/help.repository';

/**
 * O seed da central de ajuda: leva o `catalogo.json` para o banco.
 *
 * Idempotente: rodar duas vezes seguidas não muda nada na segunda. E nunca
 * destrói o trabalho do admin. O que é de quem:
 *
 * - Do roteiro (o seed sempre acerta): a existência de cada pasta,
 *   funcionalidade e aba; o ícone, `target_roles` e `admin_only` da pasta; o
 *   dispositivo e a pasta da funcionalidade; quantas abas a funcionalidade tem.
 * - Do admin (o seed só preenche na criação): ordem das pastas e das
 *   funcionalidades, descrição e resumo, publicação, vídeo, legenda, capa,
 *   duração e o tempo de início de cada aba. A funcionalidade nasce
 *   publicada, mesmo sem vídeo (os passos em texto já ensinam); se o admin
 *   despublicar, o seed nunca publica de novo.
 * - Dos dois (títulos e texto das abas): o seed preenche na criação e só
 *   reescreve com `textos: true`. É o que se usa depois de mudar a narração no
 *   roteiro; sem a opção, o ajuste fino que o admin fez numa aba sobrevive a
 *   qualquer seed.
 *
 * Nada é apagado, com uma exceção: aba que saiu do roteiro (a funcionalidade
 * passou de cinco para quatro abas). Ela não guarda vídeo, só o texto e o
 * tempo de um capítulo que o roteiro não tem mais, e deixá-la faria o commit
 * do próximo pacote recusar por número de abas diferente. Funcionalidade e
 * pasta que saíram do roteiro ficam: podem ter vídeo, e o admin decide.
 */

type Snapshot = { folders: HelpFolder[]; features: HelpFeature[]; steps: HelpStep[] };

export type SyncOptions = { textos?: boolean };

export type SyncSummary = {
  pastas: { criadas: number; atualizadas: number };
  funcionalidades: { criadas: number; atualizadas: number };
  abas: { criadas: number; atualizadas: number; removidas: number };
};

/**
 * O resumo inicial de uma funcionalidade: a primeira frase da primeira aba.
 *
 * O roteiro não tem resumo, e cartão sem resumo parece quebrado. A primeira
 * frase da narração costuma ser a que explica para que o tutorial serve; o
 * admin reescreve pela tela quando não for.
 */
export function resumoInicial(narracao: string): string {
  const frase = narracao.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? narracao;
  return frase.trim();
}

function sameArray(a: string[] | null | undefined, b: string[]) {
  const x = a ?? [];
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/**
 * O que precisa ser escrito para o banco ficar igual ao catálogo. Função pura:
 * recebe o que existe, devolve o plano. É ela que os testes exercitam.
 */
export function planSync(cat: Catalogo, existing: Snapshot, options: SyncOptions = {}): SyncPlan {
  const plan: SyncPlan = {
    folderCreates: [],
    folderUpdates: [],
    featureCreates: [],
    featureUpdates: [],
    stepCreates: [],
    stepUpdates: [],
    stepDeletes: [],
  };
  const folderBySlug = new Map(existing.folders.map((f) => [f.slug, f]));
  const featureBySlug = new Map(existing.features.map((f) => [f.slug, f]));
  const stepsByFeature = new Map<string, HelpStep[]>();
  for (const step of existing.steps) {
    const list = stepsByFeature.get(step.feature_id) ?? [];
    list.push(step);
    stepsByFeature.set(step.feature_id, list);
  }

  for (const pasta of cat.pastas) {
    const folder = folderBySlug.get(pasta.slug);
    let folderId: string;

    if (!folder) {
      folderId = randomUUID();
      plan.folderCreates.push({
        id: folderId,
        slug: pasta.slug,
        title: pasta.titulo,
        description: pasta.descricao,
        icon: pasta.icone,
        order: pasta.ordem,
        target_roles: pasta.target_roles,
        admin_only: pasta.admin_only,
      });
    } else {
      folderId = folder.id;
      const data: Record<string, unknown> = {};
      if (folder.icon !== pasta.icone) data.icon = pasta.icone;
      if (!sameArray(folder.target_roles, pasta.target_roles)) data.target_roles = pasta.target_roles;
      if (folder.admin_only !== pasta.admin_only) data.admin_only = pasta.admin_only;
      if (options.textos) {
        if (folder.title !== pasta.titulo) data.title = pasta.titulo;
        if (folder.description !== pasta.descricao) data.description = pasta.descricao;
      }
      if (Object.keys(data).length) plan.folderUpdates.push({ id: folder.id, data });
    }

    for (const func of pasta.funcionalidades) {
      const feature = featureBySlug.get(func.id);
      let featureId: string;
      const current = feature ? (stepsByFeature.get(feature.id) ?? []) : [];

      if (!feature) {
        featureId = randomUUID();
        plan.featureCreates.push({
          id: featureId,
          folder_id: folderId,
          slug: func.id,
          title: func.titulo,
          summary: resumoInicial(func.abas[0].narracao),
          device: func.dispositivo,
          order: func.ordem,
          // Nasce publicada: o tutorial já serve pelos passos em texto, e o
          // vídeo, quando chegar, aparece no topo. Só vale na criação; uma
          // funcionalidade que o admin despublicou continua despublicada.
          published: true,
        });
      } else {
        featureId = feature.id;
        const data: FeatureSyncUpdate = {};
        if (feature.folder_id !== folderId) data.folder_id = folderId;
        if (feature.device !== func.dispositivo) data.device = func.dispositivo;
        if (options.textos && feature.title !== func.titulo) data.title = func.titulo;
        if (Object.keys(data).length) plan.featureUpdates.push({ id: feature.id, data });
      }

      const byOrder = new Map(current.map((s) => [s.order, s]));
      for (const aba of func.abas) {
        const step = byOrder.get(aba.ordem);
        if (!step) {
          plan.stepCreates.push({
            id: randomUUID(),
            feature_id: featureId,
            order: aba.ordem,
            title: aba.titulo,
            body: aba.narracao,
            start_s: null,
          });
        } else if (options.textos && (step.title !== aba.titulo || step.body !== aba.narracao)) {
          plan.stepUpdates.push({ id: step.id, data: { title: aba.titulo, body: aba.narracao } });
        }
      }
      for (const step of current) {
        if (step.order > func.abas.length) plan.stepDeletes.push(step.id);
      }
    }
  }


  return plan;
}

function summarize(plan: SyncPlan): SyncSummary {
  return {
    pastas: { criadas: plan.folderCreates.length, atualizadas: plan.folderUpdates.length },
    funcionalidades: { criadas: plan.featureCreates.length, atualizadas: plan.featureUpdates.length },
    abas: {
      criadas: plan.stepCreates.length,
      atualizadas: plan.stepUpdates.length,
      removidas: plan.stepDeletes.length,
    },
  };
}

export const helpSeedService = {
  /** Lê o banco, planeja e aplica. Devolve quanto foi criado, mudado e removido. */
  async sync(options: SyncOptions = {}, cat: Catalogo = catalogoAtual): Promise<SyncSummary> {
    const existing = await helpRepository.snapshot();
    const plan = planSync(cat, existing, options);
    await helpRepository.applySync(plan);
    return summarize(plan);
  },
};
