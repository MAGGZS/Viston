import { PlanCode } from '@prisma/client';
import { planRepository } from '../repositories/plan.repository';
import { DEFAULT_PLAN, Feature, Limits, PLANS } from '../utils/plans';

/** Quem respondeu "qual é o plano desta conta". */
export type PlanSource = 'CONCESSAO' | 'ASSINATURA' | 'PADRAO';

export interface ResolvedPlan {
  readonly code: PlanCode;
  readonly source: PlanSource;
  readonly limits: Limits;
  readonly features: readonly Feature[];
  /** Prédios comprados além dos inclusos, já limitados ao teto do plano. */
  readonly extraBuildings: number;
  /** Quantos prédios a conta pode ter ao todo: inclusos mais extras. */
  readonly buildingsAllowed: number;
}

/**
 * O plano já resolvido nesta requisição.
 *
 * Mesmo desenho da cache de `getBuildingStanding`: a chave é um objeto de vida
 * curta — `req.user`, que é novo a cada requisição —, então a cache morre junto
 * com ela. Não precisa de invalidação e não corre o risco de responder com o
 * plano de ontem, que é o que um cache global custaria caro: conta que acabou
 * de assinar continuaria barrada.
 *
 * O `Map` de dentro é por gestor porque uma requisição pode perguntar por mais
 * de um: quem tem prédios de donos diferentes lista os dois na mesma chamada.
 */
const planCache = new WeakMap<object, Map<string, ResolvedPlan>>();

export const planService = {
  /**
   * Qual plano vale para esta conta de gestor, e por quê.
   *
   * A precedência, nesta ordem:
   *
   * 1. Concessão ativa do admin. Vence sempre — é a única forma de o suporte
   *    resolver na hora um problema sem mexer no que o cliente contratou.
   * 2. Assinatura do Stripe, quando o status dá acesso (ver
   *    `ACCESS_GRANTING_STATUSES`).
   * 3. LIVRE. Não é punição: é o produto pequeno, e é onde toda conta nova
   *    começa.
   *
   * `scope` é o objeto que dá vida à cache — passe `req.user`. Sem ele a
   * resposta vem do banco toda vez, que é o certo para quem chama de fora de
   * uma requisição (um job, uma migração de dados).
   */
  async resolvePlan(managerId: string, scope?: object): Promise<ResolvedPlan> {
    const cached = scope && planCache.get(scope)?.get(managerId);
    if (cached) return cached;

    const resolved = await resolve(managerId);

    if (scope) {
      let byManager = planCache.get(scope);
      if (!byManager) {
        byManager = new Map();
        planCache.set(scope, byManager);
      }
      byManager.set(managerId, resolved);
    }

    return resolved;
  },
};

async function resolve(managerId: string): Promise<ResolvedPlan> {
  const [grant, subscription] = await Promise.all([
    planRepository.findActiveGrant(managerId),
    planRepository.findActiveSubscription(managerId),
  ]);

  const code = grant?.plan ?? subscription?.plan ?? DEFAULT_PLAN;
  const source: PlanSource = grant ? 'CONCESSAO' : subscription ? 'ASSINATURA' : 'PADRAO';
  const plan = PLANS[code];

  // Os extras vêm da assinatura mesmo quando é a concessão que decide o plano:
  // são prédios pagos, e uma cortesia do admin não pode apagar o que alguém
  // comprou. O teto continua sendo o do plano que valeu — concessão de
  // ESSENCIAL com vinte extras pagos dá os dois extras que o ESSENCIAL permite.
  const extraBuildings = Math.min(
    subscription?.extra_buildings ?? 0,
    plan.limits.extraBuildings
  );

  return {
    code,
    source,
    limits: plan.limits,
    features: plan.features,
    extraBuildings,
    buildingsAllowed: plan.limits.buildings + extraBuildings,
  };
}
