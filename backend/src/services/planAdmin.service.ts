import { AuditAction, PlanCode } from '@prisma/client';
import { planRepository } from '../repositories/plan.repository';
import { managerRepository } from '../repositories/manager.repository';
import { buildingRepository, auditRepository, actorAudit } from '../repositories/building.repository';
import { usageService } from './usage.service';
import { planService } from './plan.service';
import { Actor } from '../middlewares/authenticate';
import { ConflictError, NotFoundError } from '../utils/errors';
import { PLANS } from '../utils/plans';

/**
 * O que o admin pode fazer com o plano de uma conta.
 *
 * Existe porque o suporte precisa de uma saída que não seja `UPDATE` no banco.
 * Cobrança que travou no domingo, cliente que pagou e não recebeu, parceria
 * combinada por fora, teste de uma semana: sem isto, todos esses casos acabam
 * em alguém abrindo o console do Postgres — sem prazo, sem motivo escrito e sem
 * deixar rastro.
 *
 * Nada aqui toca o Stripe. A concessão é um caminho paralelo ao que o cliente
 * contratou, e é essa separação que permite resolver o problema de hoje sem
 * mexer na assinatura dele (ver a precedência em `planService.resolvePlan`).
 */

/** Quem concedeu, quando quem concedeu é uma conta de usuário (o admin). */
function grantedBy(actor: Actor): string | null {
  return actor.kind === 'USER' ? actor.id : null;
}

async function assertManagerExists(managerId: string) {
  const manager = await managerRepository.findById(managerId);
  if (!manager) throw new NotFoundError('Gestor');
  return manager;
}

export const planAdminService = {
  /**
   * O plano da conta como o admin precisa ver: o que vale, de onde veio, o que
   * já se gastou e o histórico das concessões.
   *
   * O consumo vem junto porque é a primeira pergunta de quem vai decidir se
   * concede: "ele está pedindo mais porque estourou o quê?".
   */
  async summary(managerId: string) {
    await assertManagerExists(managerId);

    const [plan, grants, buildings, emails, storageBytes] = await Promise.all([
      planService.resolvePlan(managerId),
      planRepository.listGrants(managerId),
      planRepository.countOwnedBuildings(managerId),
      usageService.emailsSent(managerId),
      usageService.storageUsedBytes(managerId),
    ]);

    return {
      plan: {
        code: plan.code,
        name: PLANS[plan.code].name,
        source: plan.source,
        features: plan.features,
        buildings_allowed: plan.buildingsAllowed,
        extra_buildings: plan.extraBuildings,
      },
      usage: {
        buildings,
        emails_this_month: emails,
        storage_bytes: storageBytes,
        period: usageService.currentPeriod(),
      },
      grants,
    };
  },

  /**
   * Abre uma concessão.
   *
   * Sem fechar a anterior: a mais recente entre as válidas é que responde (ver
   * `planRepository.findActiveGrant`), e a antiga continua no histórico
   * dizendo o que valeu naquele período. Fechá-la aqui só apagaria essa
   * memória.
   */
  async grant(
    managerId: string,
    data: { plan: PlanCode; reason: string; days?: number },
    actor: Actor
  ) {
    await assertManagerExists(managerId);

    // Fecha concessões anteriores ativas antes de abrir a nova,
    // garantindo que não fiquem concessões duplicadas concorrendo.
    await planRepository.revokeAllActiveGrants(managerId);

    const expires_at = data.days
      ? new Date(Date.now() + data.days * 24 * 60 * 60 * 1000)
      : null;

    const grant = await planRepository.createGrant({
      manager_id: managerId,
      plan: data.plan,
      reason: data.reason,
      granted_by: grantedBy(actor),
      expires_at,
    });

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.PLAN_GRANTED,
      entity: 'PlanGrant',
      entity_id: grant.id,
      metadata: { manager_id: managerId, plan: data.plan, days: data.days ?? null, reason: data.reason },
    });

    return grant;
  },

  /**
   * Fecha a concessão agora.
   *
   * Revoga todas as concessões ativas deste gestor, garantindo que
   * a conta volte imediatamente para o plano LIVRE (sem concessões antigas
   * "revivendo" no histórico).
   */
  async revoke(grantId: string, actor: Actor) {
    const grant = await planRepository.findGrantById(grantId);
    if (!grant) throw new NotFoundError('Concessão');
    if (grant.revoked_at) throw new ConflictError('Esta concessão já foi revogada');

    const revoked = await planRepository.revokeGrant(grantId);
    await planRepository.revokeAllActiveGrants(grant.manager_id);

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.PLAN_REVOKED,
      entity: 'PlanGrant',
      entity_id: grantId,
      metadata: { manager_id: grant.manager_id, plan: grant.plan },
    });

    return revoked;
  },

  /**
   * Suspende a conta de gestor, ou a devolve.
   *
   * Pedir o mesmo estado duas vezes é recusado: repetir a suspensão reescreveria
   * "desde quando", que é a informação que a suspensão guarda.
   */
  async setSuspension(managerId: string, suspended: boolean, actor: Actor) {
    const manager = await assertManagerExists(managerId);

    if (Boolean(manager.suspended_at) === suspended) {
      throw new ConflictError(
        suspended ? 'Esta conta já está suspensa' : 'Esta conta não está suspensa'
      );
    }

    const updated = await managerRepository.setSuspended(managerId, suspended);

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.UPDATE,
      entity: 'Manager',
      entity_id: managerId,
      metadata: { suspended },
    });

    return { id: updated.id, suspended_at: updated.suspended_at };
  },

  /**
   * Inativa o prédio, ou o traz de volta.
   *
   * Reativar é do admin de propósito: prédio congelado por transferência que
   * ninguém aceitou não pode voltar sozinho no clique de quem o abandonou.
   */
  async setFreeze(buildingId: string, frozen: boolean, actor: Actor) {
    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');

    if (Boolean(building.frozen_at) === frozen) {
      throw new ConflictError(
        frozen ? 'Este prédio já está inativo' : 'Este prédio não está inativo'
      );
    }

    const updated = await buildingRepository.setFrozen(buildingId, frozen);

    await auditRepository.log({
      ...actorAudit(actor),
      building_id: buildingId,
      action: AuditAction.BUILDING_FROZEN,
      entity: 'Building',
      entity_id: buildingId,
      metadata: { frozen },
    });

    return { id: updated.id, frozen_at: updated.frozen_at };
  },
};
