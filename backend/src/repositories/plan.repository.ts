import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Os status em que a assinatura dá acesso.
 *
 * PAST_DUE está na lista de propósito: a cobrança falhou e o Stripe vai tentar
 * de novo por alguns dias. Cortar o produto no primeiro cartão recusado castiga
 * quem só trocou de cartão — quem não pagar mesmo chega em UNPAID ou CANCELED,
 * e aí sai.
 */
export const ACCESS_GRANTING_STATUSES = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
] as const;

export const planRepository = {
  /**
   * A concessão do admin que vale para esta conta agora.
   *
   * Vale a que não foi revogada, já começou e ainda não venceu — `expires_at`
   * nulo é concessão sem prazo. Entre duas válidas, a mais recente: é a última
   * decisão do admin, e é essa que ele espera ver valendo.
   */
  findActiveGrant(managerId: string, now = new Date()) {
    return prisma.planGrant.findFirst({
      where: {
        manager_id: managerId,
        revoked_at: null,
        starts_at: { lte: now },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
  },

  /**
   * A assinatura da conta, quando ela dá acesso.
   *
   * O filtro de status está aqui e não em quem chama porque "assinatura que
   * vale" é uma só definição — espalhá-la faria a rota nova esquecer o
   * PAST_DUE.
   */
  findActiveSubscription(managerId: string) {
    return prisma.subscription.findFirst({
      where: {
        manager_id: managerId,
        status: { in: [...ACCESS_GRANTING_STATUSES] },
      },
    });
  },

  /**
   * Abre uma concessão para a conta.
   *
   * `expires_at` nulo é sem prazo, e é escolha do admin — não um esquecimento:
   * a rota pede os dias e só omite quando ele diz que não vence.
   */
  createGrant(data: {
    manager_id: string;
    plan: PlanCode;
    reason: string;
    granted_by: string | null;
    expires_at: Date | null;
  }) {
    return prisma.planGrant.create({ data });
  },

  findGrantById(id: string) {
    return prisma.planGrant.findUnique({ where: { id } });
  },

  /**
   * Fecha a concessão agora.
   *
   * Carimba em vez de apagar: saber que uma conta teve PRO por duas semanas é
   * o tipo de coisa que se precisa responder depois, e linha apagada não
   * responde nada.
   */
  revokeGrant(id: string, at = new Date()) {
    return prisma.planGrant.update({ where: { id }, data: { revoked_at: at } });
  },

  /** O histórico da conta, do mais recente para o mais antigo. */
  listGrants(managerId: string) {
    return prisma.planGrant.findMany({
      where: { manager_id: managerId },
      orderBy: { created_at: 'desc' },
    });
  },

  /** Quantos prédios a conta paga hoje — os que ela criou e os que herdou. */
  countOwnedBuildings(managerId: string) {
    return prisma.building.count({ where: { owner_manager_id: managerId } });
  },
};
