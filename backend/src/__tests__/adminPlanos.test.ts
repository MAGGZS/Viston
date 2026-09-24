import request from 'supertest';

// Os repositórios saem de cena: o alvo aqui é a guarda do admin, a forma das
// rotas e as regras de concessão — não o acesso ao banco.
jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../repositories/plan.repository');
jest.mock('../services/usage.service');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

import app from '../app';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { userRepository } from '../repositories/user.repository';
import { planRepository } from '../repositories/plan.repository';
import { usageService } from '../services/usage.service';
import { signAccessToken } from '../utils/jwt';

const mockBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAudit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockManagers = managerRepository as jest.Mocked<typeof managerRepository>;
const mockUsers = userRepository as jest.Mocked<typeof userRepository>;
const mockPlans = planRepository as jest.Mocked<typeof planRepository>;
const mockUsage = usageService as jest.Mocked<typeof usageService>;

const ADMIN_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const MANAGER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const BUILDING_ID = 'cccccccc-3333-4333-8333-333333333333';
const GRANT_ID = 'dddddddd-4444-4444-8444-444444444444';

const tokenAdmin = signAccessToken(ADMIN_ID, 'ADMIN', 'USER');
const tokenGestor = signAccessToken(MANAGER_ID, 'NONE', 'MANAGER');

const manager = (overrides: Record<string, unknown> = {}) =>
  ({ id: MANAGER_ID, name: 'Ana', status: 'ACTIVE', token_version: 0, suspended_at: null, ...overrides }) as never;

const grant = (overrides: Record<string, unknown> = {}) =>
  ({
    id: GRANT_ID,
    manager_id: MANAGER_ID,
    plan: PlanCode.ESSENCIAL,
    reason: 'parceria',
    granted_by: ADMIN_ID,
    starts_at: new Date(),
    expires_at: null,
    revoked_at: null,
    created_at: new Date(),
    ...overrides,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();

  // O `authorize('ADMIN')` confere a conta no banco a cada chamada.
  mockUsers.findById.mockResolvedValue({
    id: ADMIN_ID,
    role: 'ADMIN',
    status: 'ACTIVE',
    token_version: 0,
  } as never);
  mockManagers.findById.mockResolvedValue(manager());
  mockAudit.log.mockResolvedValue(undefined as never);

  mockPlans.findActiveGrant.mockResolvedValue(null);
  mockPlans.findActiveSubscription.mockResolvedValue(null);
  mockPlans.listGrants.mockResolvedValue([] as never);
  mockPlans.countOwnedBuildings.mockResolvedValue(0);
  mockPlans.createGrant.mockResolvedValue(grant());
  mockPlans.findGrantById.mockResolvedValue(grant());
  mockPlans.revokeGrant.mockResolvedValue(grant({ revoked_at: new Date() }));
  mockPlans.revokeAllActiveGrants.mockResolvedValue({ count: 1 } as never);

  mockUsage.emailsSent.mockResolvedValue(0);
  mockUsage.storageUsedBytes.mockResolvedValue(0);
  mockUsage.currentPeriod.mockReturnValue('2026-09');
});

describe('a guarda das rotas de plano', () => {
  it('gestor não entra no painel de planos do admin', async () => {
    const res = await request(app)
      .get(`/admin/managers/${MANAGER_ID}/plan`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(403);
  });

  it('sem token, nem a forma da rota se descobre', async () => {
    const res = await request(app).get(`/admin/managers/${MANAGER_ID}/plan`);

    expect(res.status).toBe(401);
  });

  it('conta que deixou de ser ADMIN no banco perde o acesso, com token válido', async () => {
    mockUsers.findById.mockResolvedValue({ id: ADMIN_ID, role: 'NONE', status: 'ACTIVE', token_version: 0 } as never);

    const res = await request(app)
      .get(`/admin/managers/${MANAGER_ID}/plan`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /admin/managers/:managerId/plan', () => {
  it('diz o plano que vale, de onde ele vem e o que já se gastou', async () => {
    mockPlans.findActiveSubscription.mockResolvedValue({
      plan: PlanCode.PRO,
      status: SubscriptionStatus.ACTIVE,
      extra_buildings: 2,
    } as never);
    mockPlans.countOwnedBuildings.mockResolvedValue(4);
    mockUsage.emailsSent.mockResolvedValue(120);
    mockUsage.storageUsedBytes.mockResolvedValue(1024);

    const res = await request(app)
      .get(`/admin/managers/${MANAGER_ID}/plan`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toMatchObject({
      code: 'PRO',
      source: 'ASSINATURA',
      buildings_allowed: 7,
      extra_buildings: 2,
    });
    expect(res.body.usage).toEqual({
      buildings: 4,
      emails_this_month: 120,
      storage_bytes: 1024,
      period: '2026-09',
    });
  });

  it('gestor que não existe é 404, e não um plano LIVRE inventado', async () => {
    mockManagers.findById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/admin/managers/${MANAGER_ID}/plan`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /admin/managers/:managerId/grants', () => {
  it('concede com prazo, e o prazo vira data', async () => {
    const res = await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'PRO', reason: 'parceria com a administradora', days: 30 });

    expect(res.status).toBe(201);

    const data = mockPlans.createGrant.mock.calls[0][0];
    expect(data).toMatchObject({
      manager_id: MANAGER_ID,
      plan: 'PRO',
      reason: 'parceria com a administradora',
      granted_by: ADMIN_ID,
    });

    const dias = (data.expires_at!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
  });

  it('sem prazo é concessão sem prazo, e não erro', async () => {
    const res = await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'ESSENCIAL', reason: 'suporte' });

    expect(res.status).toBe(201);
    expect(mockPlans.createGrant.mock.calls[0][0].expires_at).toBeNull();
  });

  it('a concessão fica na trilha, com o motivo escrito', async () => {
    await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'PRO', reason: 'cobranca travada no domingo', days: 7 });

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PLAN_GRANTED',
        entity: 'PlanGrant',
        metadata: expect.objectContaining({ plan: 'PRO', reason: 'cobranca travada no domingo' }),
      })
    );
  });

  it('sem motivo não concede', async () => {
    const res = await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'PRO' });

    expect(res.status).toBe(400);
    expect(mockPlans.createGrant).not.toHaveBeenCalled();
  });

  it('plano que não existe no catálogo não entra no banco', async () => {
    const res = await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'PLATINA', reason: 'tentativa' });

    expect(res.status).toBe(400);
    expect(mockPlans.createGrant).not.toHaveBeenCalled();
  });

  it('prazo acima do teto é recusado', async () => {
    const res = await request(app)
      .post(`/admin/managers/${MANAGER_ID}/grants`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ plan: 'PRO', reason: 'dedo escorregou', days: 40000 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /admin/grants/:id', () => {
  it('revoga e deixa a revogação na trilha', async () => {
    const res = await request(app)
      .delete(`/admin/grants/${GRANT_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(mockPlans.revokeGrant).toHaveBeenCalledWith(GRANT_ID);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_REVOKED', entity_id: GRANT_ID })
    );
  });

  it('revogar duas vezes é conflito: a data diz quando o acesso caiu', async () => {
    mockPlans.findGrantById.mockResolvedValue(grant({ revoked_at: new Date('2026-09-01') }));

    const res = await request(app)
      .delete(`/admin/grants/${GRANT_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(409);
    expect(mockPlans.revokeGrant).not.toHaveBeenCalled();
  });

  it('concessão que não existe é 404', async () => {
    mockPlans.findGrantById.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/admin/grants/${GRANT_ID}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /admin/managers/:managerId/suspension', () => {
  it('suspende a conta e carimba a data', async () => {
    mockManagers.setSuspended.mockResolvedValue(
      manager({ suspended_at: new Date('2026-09-19T12:00:00Z') })
    );

    const res = await request(app)
      .patch(`/admin/managers/${MANAGER_ID}/suspension`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ suspended: true });

    expect(res.status).toBe(200);
    expect(mockManagers.setSuspended).toHaveBeenCalledWith(MANAGER_ID, true);
    expect(res.body.suspended_at).not.toBeNull();
  });

  it('suspender quem já está suspenso é conflito, e não reescreve a data', async () => {
    mockManagers.findById.mockResolvedValue(manager({ suspended_at: new Date('2026-09-01') }));

    const res = await request(app)
      .patch(`/admin/managers/${MANAGER_ID}/suspension`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ suspended: true });

    expect(res.status).toBe(409);
    expect(mockManagers.setSuspended).not.toHaveBeenCalled();
  });

  it('devolver a conta limpa a data', async () => {
    mockManagers.findById.mockResolvedValue(manager({ suspended_at: new Date('2026-09-01') }));
    mockManagers.setSuspended.mockResolvedValue(manager({ suspended_at: null }));

    const res = await request(app)
      .patch(`/admin/managers/${MANAGER_ID}/suspension`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ suspended: false });

    expect(res.status).toBe(200);
    expect(res.body.suspended_at).toBeNull();
  });
});

describe('PATCH /admin/buildings/:id/freeze', () => {
  beforeEach(() => {
    mockBuildings.findById.mockResolvedValue({ id: BUILDING_ID, frozen_at: null } as never);
    mockBuildings.setFrozen.mockResolvedValue({
      id: BUILDING_ID,
      frozen_at: new Date('2026-09-19T12:00:00Z'),
    } as never);
  });

  it('inativa o prédio e registra na trilha dele', async () => {
    const res = await request(app)
      .patch(`/admin/buildings/${BUILDING_ID}/freeze`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ frozen: true });

    expect(res.status).toBe(200);
    expect(mockBuildings.setFrozen).toHaveBeenCalledWith(BUILDING_ID, true);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BUILDING_FROZEN',
        building_id: BUILDING_ID,
        metadata: { frozen: true },
      })
    );
  });

  it('inativar o que já está inativo é conflito', async () => {
    mockBuildings.findById.mockResolvedValue({
      id: BUILDING_ID,
      frozen_at: new Date('2026-09-01'),
    } as never);

    const res = await request(app)
      .patch(`/admin/buildings/${BUILDING_ID}/freeze`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ frozen: true });

    expect(res.status).toBe(409);
    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('prédio que não existe é 404', async () => {
    mockBuildings.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/admin/buildings/${BUILDING_ID}/freeze`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ frozen: true });

    expect(res.status).toBe(404);
  });
});

/**
 * A lista de gestores do painel de planos.
 *
 * A busca é do banco, e não da tela: com 20 por página, filtrar no cliente
 * respondia "nenhum gestor encontrado" para o gestor de número 21 — um falso
 * negativo em cima de uma conta que existe.
 */
describe('GET /managers — a busca do suporte', () => {
  beforeEach(() => {
    mockManagers.findAll.mockResolvedValue([[], 0] as never);
  });

  it('manda o termo para o repositório, e não filtra o que já chegou', async () => {
    const res = await request(app)
      .get('/managers?search=ana')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(mockManagers.findAll).toHaveBeenCalledWith(1, 20, 'ana');
  });

  it('sem termo, a busca não existe — e a página inteira volta', async () => {
    await request(app).get('/managers').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(mockManagers.findAll).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('termo só de espaços vale o mesmo que termo nenhum', async () => {
    await request(app).get('/managers?search=%20%20').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(mockManagers.findAll).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('termo gigante é cortado antes de chegar ao banco', async () => {
    await request(app)
      .get(`/managers?search=${'a'.repeat(500)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    const [, , termo] = mockManagers.findAll.mock.calls[0];
    expect(termo).toHaveLength(120);
  });

  it('a página pedida é a página consultada', async () => {
    await request(app).get('/managers?page=3&search=ana').set('Authorization', `Bearer ${tokenAdmin}`);

    expect(mockManagers.findAll).toHaveBeenCalledWith(3, 20, 'ana');
  });

  it('gestor não entra no painel de gestores', async () => {
    const res = await request(app).get('/managers').set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(403);
    expect(mockManagers.findAll).not.toHaveBeenCalled();
  });
});
