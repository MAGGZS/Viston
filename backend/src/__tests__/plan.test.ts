jest.mock('../repositories/plan.repository');

import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { planRepository } from '../repositories/plan.repository';
import { planService } from '../services/plan.service';
import { ILIMITADO, PLANS } from '../utils/plans';

const mockPlanRepo = planRepository as jest.Mocked<typeof planRepository>;

const MANAGER_ID = 'm1111111-1111-4111-8111-111111111111';
const OUTRO_MANAGER_ID = 'm2222222-2222-4222-8222-222222222222';

/**
 * A concessão como o repositório a entrega.
 *
 * O filtro de prazo e de revogação é do repositório (ver `findActiveGrant`), e
 * por isso a concessão vencida ou revogada aparece aqui como `null`: é o que o
 * banco devolve. O que se testa no serviço é a precedência — quem ganha de
 * quem —, não a consulta.
 */
const concessao = (plan: PlanCode) => ({ plan }) as any;

const assinatura = (plan: PlanCode, extras = 0) =>
  ({
    plan,
    status: SubscriptionStatus.ACTIVE,
    extra_buildings: extras,
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockPlanRepo.findActiveGrant.mockResolvedValue(null);
  mockPlanRepo.findActiveSubscription.mockResolvedValue(null);
});

describe('planService.resolvePlan — precedência', () => {
  it('a concessão ativa do admin vence a assinatura', async () => {
    mockPlanRepo.findActiveGrant.mockResolvedValue(concessao(PlanCode.PRO));
    mockPlanRepo.findActiveSubscription.mockResolvedValue(assinatura(PlanCode.ESSENCIAL));

    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.code).toBe(PlanCode.PRO);
    expect(plano.source).toBe('CONCESSAO');
  });

  it('a concessão vencida ou revogada não vale, e a assinatura responde', async () => {
    // Vencida e revogada saem na mesma resposta do repositório: nenhuma linha.
    mockPlanRepo.findActiveGrant.mockResolvedValue(null);
    mockPlanRepo.findActiveSubscription.mockResolvedValue(assinatura(PlanCode.ESSENCIAL));

    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.code).toBe(PlanCode.ESSENCIAL);
    expect(plano.source).toBe('ASSINATURA');
  });

  it('sem concessão e sem assinatura o plano é LIVRE', async () => {
    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.code).toBe(PlanCode.LIVRE);
    expect(plano.source).toBe('PADRAO');
  });

  it('assinatura sem status de acesso não chega ao serviço, e o plano cai para LIVRE', async () => {
    // O filtro de status é do repositório: CANCELED e UNPAID não voltam de lá.
    mockPlanRepo.findActiveSubscription.mockResolvedValue(null);

    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.code).toBe(PlanCode.LIVRE);
    expect(plano.source).toBe('PADRAO');
  });
});

describe('planService.resolvePlan — limites e extras', () => {
  it('o LIVRE traz os limites do catálogo, e nenhum recurso', async () => {
    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.limits).toEqual(PLANS[PlanCode.LIVRE].limits);
    expect(plano.features).toEqual([]);
    expect(plano.buildingsAllowed).toBe(1);
  });

  it('os prédios extras comprados somam aos inclusos', async () => {
    mockPlanRepo.findActiveSubscription.mockResolvedValue(assinatura(PlanCode.PRO, 3));

    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.extraBuildings).toBe(3);
    expect(plano.buildingsAllowed).toBe(5 + 3);
  });

  it('os extras pagos sobrevivem à concessão, mas caem ao teto do plano que valeu', async () => {
    mockPlanRepo.findActiveGrant.mockResolvedValue(concessao(PlanCode.ESSENCIAL));
    mockPlanRepo.findActiveSubscription.mockResolvedValue(assinatura(PlanCode.PRO, 20));

    const plano = await planService.resolvePlan(MANAGER_ID);

    // ESSENCIAL permite dois extras, e não os vinte contratados no PRO.
    expect(plano.code).toBe(PlanCode.ESSENCIAL);
    expect(plano.extraBuildings).toBe(2);
    expect(plano.buildingsAllowed).toBe(1 + 2);
  });

  it('o ESSENCIAL e o PRO não limitam pessoas', async () => {
    mockPlanRepo.findActiveSubscription.mockResolvedValue(assinatura(PlanCode.ESSENCIAL));

    const plano = await planService.resolvePlan(MANAGER_ID);

    expect(plano.limits.people.INSPECTOR).toBe(ILIMITADO);
    expect(plano.limits.people.MODERADOR).toBe(ILIMITADO);
    expect(PLANS[PlanCode.LIVRE].limits.people.MODERADOR).toBe(0);
  });
});

describe('planService.resolvePlan — cache da requisição', () => {
  it('pergunta ao banco uma vez por gestor dentro do mesmo escopo', async () => {
    const scope = {};

    await planService.resolvePlan(MANAGER_ID, scope);
    await planService.resolvePlan(MANAGER_ID, scope);

    expect(mockPlanRepo.findActiveGrant).toHaveBeenCalledTimes(1);
  });

  it('gestores diferentes no mesmo escopo são consultas diferentes', async () => {
    const scope = {};

    await planService.resolvePlan(MANAGER_ID, scope);
    await planService.resolvePlan(OUTRO_MANAGER_ID, scope);

    expect(mockPlanRepo.findActiveGrant).toHaveBeenCalledTimes(2);
  });

  it('sem escopo não há cache: cada chamada vai ao banco', async () => {
    await planService.resolvePlan(MANAGER_ID);
    await planService.resolvePlan(MANAGER_ID);

    expect(mockPlanRepo.findActiveGrant).toHaveBeenCalledTimes(2);
  });

  it('a cache não atravessa requisições — escopo novo, consulta nova', async () => {
    await planService.resolvePlan(MANAGER_ID, {});
    await planService.resolvePlan(MANAGER_ID, {});

    expect(mockPlanRepo.findActiveGrant).toHaveBeenCalledTimes(2);
  });
});
