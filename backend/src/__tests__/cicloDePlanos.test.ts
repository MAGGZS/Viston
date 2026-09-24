import request from 'supertest';

jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../repositories/plan.repository');
jest.mock('../services/usage.service');
jest.mock('../services/ownership.service');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

// O segredo entra antes de `config` carregar: ele lê o ambiente no import.
process.env.JOB_SECRET = 'segredo-de-teste-do-ciclo';

import app from '../app';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { planRepository } from '../repositories/plan.repository';
import { ownershipService } from '../services/ownership.service';
import { planJobService } from '../services/planJob.service';

const mockBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAudit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockPlans = planRepository as jest.Mocked<typeof planRepository>;
const mockOwnership = ownershipService as jest.Mocked<typeof ownershipService>;

const GESTOR_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

const predio = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Prédio ${id}`,
  frozen_at: null,
  desde: new Date('2026-01-01'),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();

  mockOwnership.expireOverdue.mockResolvedValue({ expired: 0 });
  mockBuildings.listOwnersWithBuildings.mockResolvedValue([GESTOR_ID]);
  mockBuildings.listOwnedByManager.mockResolvedValue([] as never);
  mockBuildings.setFrozen.mockResolvedValue({} as never);
  mockAudit.log.mockResolvedValue(undefined as never);
  mockAudit.lastFreezeOf.mockResolvedValue(null);

  mockPlans.findActiveGrant.mockResolvedValue(null);
  mockPlans.findActiveSubscription.mockResolvedValue(null); // LIVRE: um prédio
});

describe('congelamento do que passou do plano', () => {
  it('a conta no LIVRE com três prédios mantém o mais antigo e congela os dois mais novos', async () => {
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1', { desde: new Date('2026-01-01') }),
      predio('p2', { desde: new Date('2026-03-01') }),
      predio('p3', { desde: new Date('2026-06-01') }),
    ] as never);

    const resultado = await planJobService.freezeOverLimit();

    expect(resultado).toEqual({ frozen: 2, checked: 1 });
    expect(mockBuildings.setFrozen).toHaveBeenCalledWith('p2', true);
    expect(mockBuildings.setFrozen).toHaveBeenCalledWith('p3', true);
    expect(mockBuildings.setFrozen).not.toHaveBeenCalledWith('p1', true);
  });

  it('o motivo fica na trilha: é ele que permite descongelar depois', async () => {
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2', { desde: new Date('2026-06-01') }),
    ] as never);

    await planJobService.freezeOverLimit();

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BUILDING_FROZEN',
        building_id: 'p2',
        metadata: expect.objectContaining({ frozen: true, motivo: 'fora_do_plano' }),
      })
    );
  });

  it('quem cabe no plano não é tocado', async () => {
    mockPlans.findActiveSubscription.mockResolvedValue({
      plan: PlanCode.PRO,
      status: SubscriptionStatus.ACTIVE,
      extra_buildings: 0,
    } as never);
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2'),
      predio('p3'),
    ] as never);

    const resultado = await planJobService.freezeOverLimit();

    expect(resultado.frozen).toBe(0);
    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('prédio já inativo não é congelado de novo', async () => {
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2', { frozen_at: new Date('2026-09-01'), desde: new Date('2026-06-01') }),
    ] as never);

    const resultado = await planJobService.freezeOverLimit();

    expect(resultado.frozen).toBe(0);
    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('conta que voltou a caber no plano tem o prédio de volta, sem pedir', async () => {
    // PRO comporta cinco: os dois prédios voltam a caber.
    mockPlans.findActiveGrant.mockResolvedValue({ plan: PlanCode.PRO } as never);
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2', { frozen_at: new Date('2026-09-01'), desde: new Date('2026-06-01') }),
    ] as never);
    mockAudit.lastFreezeOf.mockResolvedValue({
      metadata: { frozen: true, motivo: 'fora_do_plano' },
    } as never);

    await planJobService.freezeOverLimit();

    expect(mockBuildings.setFrozen).toHaveBeenCalledWith('p2', false);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ frozen: false, motivo: 'plano_regularizado' }),
      })
    );
  });

  it('prédio parado por transferência recusada continua parado', async () => {
    mockPlans.findActiveGrant.mockResolvedValue({ plan: PlanCode.PRO } as never);
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1', { frozen_at: new Date('2026-09-01') }),
    ] as never);
    mockAudit.lastFreezeOf.mockResolvedValue({
      metadata: { frozen: true, motivo: 'transferencia_recusada' },
    } as never);

    await planJobService.freezeOverLimit();

    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('falha numa conta não impede as outras', async () => {
    mockBuildings.listOwnersWithBuildings.mockResolvedValue([GESTOR_ID, 'outro-gestor']);
    mockBuildings.listOwnedByManager
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValueOnce([predio('p1'), predio('p2', { desde: new Date('2026-06-01') })] as never);

    const resultado = await planJobService.freezeOverLimit();

    expect(resultado).toEqual({ frozen: 1, checked: 2 });
  });
});

describe('o ciclo inteiro', () => {
  it('vence as transferências e congela o excedente, e diz quanto fez', async () => {
    mockOwnership.expireOverdue.mockResolvedValue({ expired: 3 });
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2', { desde: new Date('2026-06-01') }),
    ] as never);

    const resultado = await planJobService.runDaily();

    expect(resultado).toEqual({ transfers_expired: 3, frozen: 1, checked: 1 });
  });

  it('uma parte que falha não derruba a outra', async () => {
    mockOwnership.expireOverdue.mockRejectedValue(new Error('banco fora'));
    mockBuildings.listOwnedByManager.mockResolvedValue([
      predio('p1'),
      predio('p2', { desde: new Date('2026-06-01') }),
    ] as never);

    const resultado = await planJobService.runDaily();

    expect(resultado).toEqual({ transfers_expired: 0, frozen: 1, checked: 1 });
  });
});

describe('a porta do agendador', () => {
  it('com o segredo certo, roda', async () => {
    const res = await request(app)
      .post('/jobs/planos')
      .set('X-Job-Secret', 'segredo-de-teste-do-ciclo');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('transfers_expired');
  });

  it('sem segredo, a rota nem existe', async () => {
    const res = await request(app).post('/jobs/planos');

    expect(res.status).toBe(404);
    expect(mockBuildings.listOwnersWithBuildings).not.toHaveBeenCalled();
  });

  it('com segredo errado, a resposta é a mesma de rota inexistente', async () => {
    const res = await request(app)
      .post('/jobs/planos')
      .set('X-Job-Secret', 'segredo-errado-do-tamanho-x');

    expect(res.status).toBe(404);
    expect(mockBuildings.listOwnersWithBuildings).not.toHaveBeenCalled();
  });
});
