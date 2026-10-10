import { Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
import { loadBuilding as loadRequestBuilding } from './buildingAccess';
import { planRepository } from '../repositories/plan.repository';
import { planService } from '../services/plan.service';
import { usageService } from '../services/usage.service';
import { BuildingFrozenError, FeatureLockedError, NotFoundError, PlanLimitError } from '../utils/errors';
import { Feature, PlanRole, PLANS } from '../utils/plans';

/**
 * Onde o plano vira "não".
 *
 * A pergunta é sempre a mesma: cabe mais um? Mais um prédio, mais uma pessoa
 * naquele papel, mais um megabyte de foto. Quem responde é o plano de quem paga
 * pelo prédio — `buildings.owner_manager_id` —, e não o de quem está clicando:
 * o inspetor que sobe a foto não tem plano nenhum, e cobrar dele seria cobrar
 * da pessoa errada.
 *
 * Prédio sem dono não é barrado. É o prédio cuja conta de gestor sumiu, e não há
 * plano a consultar — barrar ali puniria quem ficou por uma conta que não
 * existe mais. O caminho para esse caso é a transferência de dono, não o 403.
 *
 * Todas as checagens recebem `scope` — o `req.user`, que vive o tempo da
 * requisição — para que o plano seja resolvido uma vez só por chamada (ver a
 * cache em `planService.resolvePlan`).
 */

/**
 * O prédio e quem paga por ele. Com `scope`, reaproveita o que a guarda da rota
 * já carregou nesta requisição (ver `loadBuilding` em buildingAccess).
 */
async function loadBuilding(buildingId: string, scope?: object) {
  const building = await loadRequestBuilding(scope, buildingId);
  if (!building) throw new NotFoundError('Prédio');
  return building;
}

/** Quanto já se tem daquele papel no prédio. Gestor conta em outra tabela. */
function countPeople(buildingId: string, role: PlanRole): Promise<number> {
  return role === 'GESTOR'
    ? buildingRepository.countManagers(buildingId)
    : buildingRepository.countMembersByRole(buildingId, role);
}

/**
 * O nome do papel como a pessoa o lê na tela, no singular e no plural.
 *
 * As duas formas ficam lado a lado porque a frase do limite concorda com o
 * número: "comporta 1 inspetor", "comporta 2 inspetores". Antes só havia o
 * plural, e o plano Livre, que comporta uma pessoa por papel, aparecia como
 * "comporta 1 inspetores", que lê como erro de digitação.
 */
const NOME_DO_PAPEL: Record<PlanRole, { um: string; varios: string }> = {
  GESTOR: { um: 'gestor', varios: 'gestores' },
  [BuildingRole.MODERADOR]: { um: 'moderador', varios: 'moderadores' },
  [BuildingRole.RESPONSAVEL]: { um: 'responsável', varios: 'responsáveis' },
  [BuildingRole.INSPECTOR]: { um: 'inspetor', varios: 'inspetores' },
  [BuildingRole.VIEWER]: { um: 'visualizador', varios: 'visualizadores' },
};

/**
 * "1 prédio", "2 prédios". Singular só para exatamente um: zero e os demais
 * números vão no plural, como se fala ("comporta 0 moderadores").
 */
export function quantidadeComNome(quantidade: number, um: string, varios: string): string {
  return `${quantidade} ${quantidade === 1 ? um : varios}`;
}

/**
 * A frase de quando o papel lotou. Exportada para que o teste confira a
 * concordância em todos os papéis, inclusive com limites que nenhum plano usa
 * hoje (só o Livre tem teto de pessoas, e ele é sempre um).
 */
export function fraseDoLimiteDePapel(role: PlanRole, limite: number): string {
  const nome = NOME_DO_PAPEL[role];
  return `O plano deste prédio comporta ${quantidadeComNome(limite, nome.um, nome.varios)} por prédio.`;
}

type PlanoResolvido = Awaited<ReturnType<typeof planService.resolvePlan>>;

/**
 * O papel existe neste plano? Hoje só o moderador pode não existir.
 *
 * Separado de `assertCanAddPerson` para que a prévia de vagas (`roleCapacity`)
 * use exatamente a mesma regra e a mesma frase do erro.
 */
function recusaPorRecurso(plan: PlanoResolvido, role: PlanRole): FeatureLockedError | null {
  if (role === BuildingRole.MODERADOR && !plan.features.includes('MODERADOR')) {
    return new FeatureLockedError('O plano deste prédio não inclui moderadores.', {
      feature: 'MODERADOR',
      plan: plan.code,
    });
  }
  return null;
}

/** Ainda há vaga naquele papel, dado quantos já existem? */
function recusaPorLimite(plan: PlanoResolvido, role: PlanRole, atuais: number): PlanLimitError | null {
  const limite = plan.limits.people[role];
  if (!Number.isFinite(limite) || atuais < limite) return null;
  return new PlanLimitError(
    fraseDoLimiteDePapel(role, limite),
    { limit: limite, current: atuais, plan: plan.code }
  );
}

export const planGate = {
  /**
   * Cabe mais um prédio nesta conta?
   *
   * Conta os que ela já paga, e não os que administra: quem é co-gestor do
   * prédio de outra pessoa não paga por ele, e contá-lo cobraria duas vezes
   * pelo mesmo prédio.
   */
  async assertCanCreateBuilding(managerId: string, scope?: object): Promise<void> {
    const [plan, atuais] = await Promise.all([
      planService.resolvePlan(managerId, scope),
      planRepository.countOwnedBuildings(managerId),
    ]);

    if (atuais >= plan.buildingsAllowed) {
      throw new PlanLimitError(
        `Seu plano comporta ${quantidadeComNome(plan.buildingsAllowed, 'prédio', 'prédios')}.`,
        { limit: plan.buildingsAllowed, current: atuais, plan: plan.code }
      );
    }
  },

  /**
   * Cabe mais uma pessoa neste papel, neste prédio?
   *
   * O papel de moderador tem duas respostas possíveis, e a diferença importa
   * para quem lê: no plano que não o inclui, a mensagem é "seu plano não tem
   * moderador" e não "você já tem 0 de 0", que não explica nada.
   */
  async assertCanAddPerson(buildingId: string, role: PlanRole, scope?: object): Promise<void> {
    const building = await loadBuilding(buildingId, scope);
    if (!building.owner_manager_id) return;

    const plan = await planService.resolvePlan(building.owner_manager_id, scope);

    const semRecurso = recusaPorRecurso(plan, role);
    if (semRecurso) throw semRecurso;

    // A contagem só quando o teto é finito: no plano sem limite de pessoas ela
    // seria uma ida ao banco para uma resposta que já se sabe.
    if (!Number.isFinite(plan.limits.people[role])) return;

    const semVaga = recusaPorLimite(plan, role, await countPeople(buildingId, role));
    if (semVaga) throw semVaga;
  },

  /**
   * Quais papéis de vínculo ainda cabem neste prédio, e por que não os que não
   * cabem.
   *
   * Existe para a tela de aprovação de pedido de acesso mostrar o papel sem
   * vaga já desabilitado, com o motivo escrito, antes do clique. As contagens
   * vêm de quem chama (a lista de membros que a rota já carregou), e o motivo é
   * a mesma frase do erro de `assertCanAddPerson`: a tela e o 403 dizem a mesma
   * coisa, porque saem da mesma regra.
   *
   * É só uma prévia. A palavra final continua sendo a do `assertCanAddPerson`,
   * dentro do `withPlanLock`, no momento da aprovação.
   *
   * `atuais` pode chegar como promessa: quem chama começa isto junto com a
   * leitura dos membros, e o prédio e o plano são resolvidos enquanto a lista
   * ainda está a caminho. As contagens só são esperadas no fim.
   */
  async roleCapacity(
    buildingId: string,
    atuais: Readonly<Record<BuildingRole, number>> | Promise<Readonly<Record<BuildingRole, number>>>,
    scope?: object
  ): Promise<Record<BuildingRole, { allowed: boolean; code: string | null; reason: string | null }>> {
    const building = await loadBuilding(buildingId, scope);
    const plan = building.owner_manager_id
      ? await planService.resolvePlan(building.owner_manager_id, scope)
      : null;
    const contagens = await atuais;

    const papeis = Object.values(BuildingRole) as BuildingRole[];
    return Object.fromEntries(
      papeis.map((role) => {
        // Prédio sem dono não é barrado (ver o topo deste arquivo).
        const recusa = plan
          ? recusaPorRecurso(plan, role) ?? recusaPorLimite(plan, role, contagens[role] ?? 0)
          : null;
        return [
          role,
          { allowed: !recusa, code: recusa?.code ?? null, reason: recusa?.message ?? null },
        ];
      })
    ) as Record<BuildingRole, { allowed: boolean; code: string | null; reason: string | null }>;
  },

  /** O plano deste prédio abre aquele recurso? */
  async assertFeature(buildingId: string, feature: Feature, scope?: object): Promise<void> {
    const building = await loadBuilding(buildingId, scope);
    if (!building.owner_manager_id) return;

    const plan = await planService.resolvePlan(building.owner_manager_id, scope);
    if (plan.features.includes(feature)) return;

    throw new FeatureLockedError('O plano deste prédio não inclui este recurso.', {
      feature,
      plan: plan.code,
    });
  },

  /**
   * Cabem mais estes bytes de foto?
   *
   * A conta é da conta inteira, e não do prédio: o espaço é do plano, e o plano
   * é de quem paga. Quem tem três prédios divide o mesmo bolo entre eles.
   */
  async assertStorageRoom(buildingId: string, bytes: number, scope?: object): Promise<void> {
    if (bytes <= 0) return;

    const building = await loadBuilding(buildingId, scope);
    if (!building.owner_manager_id) return;

    const [plan, usados] = await Promise.all([
      planService.resolvePlan(building.owner_manager_id, scope),
      usageService.storageUsedBytes(building.owner_manager_id),
    ]);

    if (usados + bytes > plan.limits.storageBytes) {
      const gb = Math.round(plan.limits.storageBytes / 1024 ** 3);
      throw new PlanLimitError(
        `O espaço de fotos do plano acabou (${gb} GB). Apague fotos antigas ou mude de plano.`,
        { limit: plan.limits.storageBytes, current: usados, plan: plan.code }
      );
    }
  },

  /** O prédio está ativo? Congelado, ele é só leitura. */
  assertActive(building: { frozen_at: Date | null }): void {
    if (building.frozen_at) throw new BuildingFrozenError();
  },

  /** Nome do plano, para a mensagem que a tela monta. */
  planName(code: keyof typeof PLANS): string {
    return PLANS[code].name;
  },
};

/**
 * Barra escrita em prédio inativo.
 *
 * Só escrita: ler o que já existe continua liberado, porque o histórico é do
 * cliente e não do plano. É por isso que este middleware entra rota a rota, e
 * não no `requireBuildingMember` — a mesma guarda de vínculo serve às leituras.
 */
export function requireBuildingActive(param = 'id') {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const building = await loadBuilding(req.params[param], req.user);
    planGate.assertActive(building);
    next();
  };
}

const lockQueues = new Map<string, Promise<unknown>>();

/**
 * Serializa verificação de limite e escrita por chave (`owner` ou `building`)
 * para fechar a janela TOCTOU entre contar e gravar em requisições paralelas (SEC-14).
 */
export async function withPlanLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = lockQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => next);
  lockQueues.set(key, tail);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (lockQueues.get(key) === tail) {
      lockQueues.delete(key);
    }
  }
}
