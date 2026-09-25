import { Response, NextFunction } from 'express';
import { BuildingRole } from '@prisma/client';
import { AuthenticatedRequest } from './authenticate';
import { buildingRepository } from '../repositories/building.repository';
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

/** O prédio e quem paga por ele. */
async function loadBuilding(buildingId: string) {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new NotFoundError('Prédio');
  return building;
}

/** Quanto já se tem daquele papel no prédio. Gestor conta em outra tabela. */
function countPeople(buildingId: string, role: PlanRole): Promise<number> {
  return role === 'GESTOR'
    ? buildingRepository.countManagers(buildingId)
    : buildingRepository.countMembersByRole(buildingId, role);
}

/** O nome do papel como a pessoa o lê na tela. */
const NOME_DO_PAPEL: Record<PlanRole, string> = {
  GESTOR: 'gestores',
  [BuildingRole.MODERADOR]: 'moderadores',
  [BuildingRole.RESPONSAVEL]: 'responsáveis',
  [BuildingRole.INSPECTOR]: 'inspetores',
  [BuildingRole.VIEWER]: 'visualizadores',
};

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
        `Seu plano comporta ${plan.buildingsAllowed} ${plan.buildingsAllowed === 1 ? 'prédio' : 'prédios'}.`,
        { limit: plan.buildingsAllowed, current: atuais, plan: plan.code }
      );
    }
  },

  /**
   * Cabe mais uma pessoa neste papel, neste prédio?
   *
   * O papel de moderador tem duas respostas possíveis, e a diferença importa
   * para quem lê: no plano que não o inclui, a mensagem é "seu plano não tem
   * moderador" — e não "você já tem 0 de 0", que não explica nada.
   */
  async assertCanAddPerson(buildingId: string, role: PlanRole, scope?: object): Promise<void> {
    const building = await loadBuilding(buildingId);
    if (!building.owner_manager_id) return;

    const plan = await planService.resolvePlan(building.owner_manager_id, scope);

    if (role === BuildingRole.MODERADOR && !plan.features.includes('MODERADOR')) {
      throw new FeatureLockedError('O plano deste prédio não inclui moderadores.', {
        feature: 'MODERADOR',
        plan: plan.code,
      });
    }

    const limite = plan.limits.people[role];
    if (!Number.isFinite(limite)) return;

    const atuais = await countPeople(buildingId, role);
    if (atuais >= limite) {
      throw new PlanLimitError(
        `O plano deste prédio comporta ${limite} ${NOME_DO_PAPEL[role]} por prédio.`,
        { limit: limite, current: atuais, plan: plan.code }
      );
    }
  },

  /** O plano deste prédio abre aquele recurso? */
  async assertFeature(buildingId: string, feature: Feature, scope?: object): Promise<void> {
    const building = await loadBuilding(buildingId);
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

    const building = await loadBuilding(buildingId);
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
    const building = await loadBuilding(req.params[param]);
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
