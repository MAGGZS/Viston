import request from 'supertest';

jest.mock('../repositories/building.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/inspection.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/emailToken.repository');
jest.mock('../repositories/ownership.repository', () => ({
  ...jest.requireActual('../repositories/ownership.repository'),
  ownershipRepository: {
    findPendingByBuilding: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    listPendingFor: jest.fn(),
    listByBuilding: jest.fn(),
    respond: jest.fn(),
    accept: jest.fn(),
    listExpired: jest.fn(),
  },
}));
jest.mock('../repositories/plan.repository');
jest.mock('../services/usage.service');
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

import app from '../app';
import { PlanCode, SubscriptionStatus } from '@prisma/client';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { planRepository } from '../repositories/plan.repository';
import {
  ownershipRepository,
  PRAZO_TRANSFERENCIA_DIAS,
  TRANSFER_STATUS,
} from '../repositories/ownership.repository';
import { ownershipService } from '../services/ownership.service';
import { signAccessToken } from '../utils/jwt';

const mockBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAudit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockManagers = managerRepository as jest.Mocked<typeof managerRepository>;
const mockPlans = planRepository as jest.Mocked<typeof planRepository>;
const mockTransfers = ownershipRepository as jest.Mocked<typeof ownershipRepository>;

const DONO_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const COGESTOR_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const BUILDING_ID = 'cccccccc-3333-4333-8333-333333333333';
const TRANSFER_ID = 'dddddddd-4444-4444-8444-444444444444';

const tokenDono = signAccessToken(DONO_ID, 'NONE', 'MANAGER');
const tokenCogestor = signAccessToken(COGESTOR_ID, 'NONE', 'MANAGER');

const predio = (overrides: Record<string, unknown> = {}) =>
  ({
    id: BUILDING_ID,
    name: 'Edifício Aurora',
    owner_manager_id: DONO_ID,
    frozen_at: null,
    ...overrides,
  }) as never;

const pedido = (overrides: Record<string, unknown> = {}) =>
  ({
    id: TRANSFER_ID,
    building_id: BUILDING_ID,
    from_manager_id: DONO_ID,
    to_manager_id: COGESTOR_ID,
    status: TRANSFER_STATUS.PENDENTE,
    requested_at: new Date(),
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    responded_at: null,
    ...overrides,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();

  mockManagers.findById.mockImplementation(((id: string) =>
    Promise.resolve({
      id,
      name: id === DONO_ID ? 'Ana' : 'Bruno',
      status: 'ACTIVE',
      token_version: 0,
      suspended_at: null,
    })) as never);
  mockBuildings.findById.mockResolvedValue(predio());
  mockBuildings.findManagerLink.mockResolvedValue({
    building_id: BUILDING_ID,
    manager_id: COGESTOR_ID,
  } as never);
  mockBuildings.setFrozen.mockResolvedValue(predio({ frozen_at: new Date() }));
  mockAudit.log.mockResolvedValue(undefined as never);

  mockTransfers.findPendingByBuilding.mockResolvedValue(null);
  mockTransfers.create.mockImplementation(((data: Record<string, unknown>) =>
    Promise.resolve(pedido(data))) as never);
  mockTransfers.findById.mockResolvedValue(pedido());
  mockTransfers.respond.mockImplementation(((id: string, status: string) =>
    Promise.resolve(pedido({ id, status, responded_at: new Date() }))) as never);
  mockTransfers.accept.mockResolvedValue(pedido({ status: TRANSFER_STATUS.ACEITO }));
  mockTransfers.listPendingFor.mockResolvedValue([pedido()] as never);
  mockTransfers.listExpired.mockResolvedValue([] as never);

  // O co-gestor tem plano com espaço: os casos sem espaço dizem o contrário.
  mockPlans.findActiveGrant.mockResolvedValue(null);
  mockPlans.findActiveSubscription.mockResolvedValue({
    plan: PlanCode.PRO,
    status: SubscriptionStatus.ACTIVE,
    extra_buildings: 0,
  } as never);
  mockPlans.countOwnedBuildings.mockResolvedValue(0);
});

describe('abrir o pedido', () => {
  it('o dono oferece o prédio ao co-gestor, com prazo de sete dias', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/ownership-transfers`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ to_manager_id: COGESTOR_ID });

    expect(res.status).toBe(201);

    const data = mockTransfers.create.mock.calls[0][0];
    expect(data.from_manager_id).toBe(DONO_ID);
    expect(data.to_manager_id).toBe(COGESTOR_ID);

    const dias = (data.expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(Math.round(dias)).toBe(PRAZO_TRANSFERENCIA_DIAS);
  });

  it('co-gestor que não paga pelo prédio não o passa adiante', async () => {
    mockBuildings.findManagerLink.mockResolvedValue({
      building_id: BUILDING_ID,
      manager_id: COGESTOR_ID,
    } as never);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/ownership-transfers`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ to_manager_id: DONO_ID });

    expect(res.status).toBe(403);
    expect(mockTransfers.create).not.toHaveBeenCalled();
  });

  it('não se oferece o prédio a quem ainda não é gestor dele', async () => {
    mockBuildings.findManagerLink.mockImplementation(((_b: string, managerId: string) =>
      Promise.resolve(managerId === DONO_ID ? { building_id: BUILDING_ID, manager_id: DONO_ID } : null)) as never);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/ownership-transfers`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ to_manager_id: COGESTOR_ID });

    expect(res.status).toBe(409);
    expect(mockTransfers.create).not.toHaveBeenCalled();
  });

  it('conta suspensa não recebe prédio', async () => {
    mockManagers.findById.mockImplementation(((id: string) =>
      Promise.resolve({
        id,
        status: 'ACTIVE',
        token_version: 0,
        suspended_at: id === COGESTOR_ID ? new Date('2026-09-01') : null,
      })) as never);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/ownership-transfers`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ to_manager_id: COGESTOR_ID });

    expect(res.status).toBe(409);
  });

  it('um pedido de pé por prédio', async () => {
    mockTransfers.findPendingByBuilding.mockResolvedValue(pedido());

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/ownership-transfers`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ to_manager_id: COGESTOR_ID });

    expect(res.status).toBe(409);
  });
});

describe('responder ao pedido', () => {
  it('aceitar transfere o prédio e fecha o pedido numa transação só', async () => {
    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ accept: true });

    expect(res.status).toBe(200);
    expect(mockTransfers.accept).toHaveBeenCalledWith(TRANSFER_ID, BUILDING_ID, COGESTOR_ID);
    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('quem aceita precisa ter espaço no próprio plano', async () => {
    mockPlans.findActiveSubscription.mockResolvedValue(null); // LIVRE
    mockPlans.countOwnedBuildings.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ accept: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LIMITE_DO_PLANO');
    // O pedido continua de pé: ele resolve o plano e aceita depois.
    expect(mockTransfers.accept).not.toHaveBeenCalled();
    expect(mockTransfers.respond).not.toHaveBeenCalled();
  });

  it('recusar fecha o pedido e inativa o prédio', async () => {
    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ accept: false });

    expect(res.status).toBe(200);
    expect(mockTransfers.respond).toHaveBeenCalledWith(TRANSFER_ID, TRANSFER_STATUS.RECUSADO);
    expect(mockBuildings.setFrozen).toHaveBeenCalledWith(BUILDING_ID, true);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BUILDING_FROZEN',
        metadata: expect.objectContaining({ motivo: 'transferencia_recusada' }),
      })
    );
  });

  it('só o indicado responde', async () => {
    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({ accept: true });

    expect(res.status).toBe(403);
  });

  it('pedido já respondido não se responde de novo', async () => {
    mockTransfers.findById.mockResolvedValue(pedido({ status: TRANSFER_STATUS.ACEITO }));

    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ accept: true });

    expect(res.status).toBe(409);
  });

  it('prazo vencido não aceita mais', async () => {
    mockTransfers.findById.mockResolvedValue(
      pedido({ expires_at: new Date(Date.now() - 60_000) })
    );

    const res = await request(app)
      .patch(`/ownership-transfers/${TRANSFER_ID}`)
      .set('Authorization', `Bearer ${tokenCogestor}`)
      .send({ accept: true });

    expect(res.status).toBe(409);
    expect(mockTransfers.accept).not.toHaveBeenCalled();
  });
});

describe('o silêncio de sete dias', () => {
  it('vence o pedido e inativa o prédio', async () => {
    mockTransfers.listExpired.mockResolvedValue([pedido()] as never);

    const resultado = await ownershipService.expireOverdue();

    expect(resultado).toEqual({ expired: 1 });
    expect(mockTransfers.respond).toHaveBeenCalledWith(
      TRANSFER_ID,
      TRANSFER_STATUS.EXPIRADO,
      expect.any(Date)
    );
    expect(mockBuildings.setFrozen).toHaveBeenCalledWith(BUILDING_ID, true);
  });

  it('prédio já inativo não recebe um segundo carimbo', async () => {
    mockTransfers.listExpired.mockResolvedValue([pedido()] as never);
    mockBuildings.findById.mockResolvedValue(predio({ frozen_at: new Date('2026-09-01') }));

    await ownershipService.expireOverdue();

    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });

  it('falha num pedido não impede os outros', async () => {
    const outro = pedido({ id: 'eeeeeeee-5555-4555-8555-555555555555' });
    mockTransfers.listExpired.mockResolvedValue([pedido(), outro] as never);
    mockTransfers.respond
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValueOnce(outro);

    const resultado = await ownershipService.expireOverdue();

    expect(resultado).toEqual({ expired: 2 });
    expect(mockTransfers.respond).toHaveBeenCalledTimes(2);
  });

  it('sem pedido vencido, não mexe em prédio nenhum', async () => {
    const resultado = await ownershipService.expireOverdue();

    expect(resultado).toEqual({ expired: 0 });
    expect(mockBuildings.setFrozen).not.toHaveBeenCalled();
  });
});

describe('a lista de quem recebeu o convite', () => {
  it('mostra o que espera resposta desta conta', async () => {
    const res = await request(app)
      .get('/ownership-transfers/me')
      .set('Authorization', `Bearer ${tokenCogestor}`);

    expect(res.status).toBe(200);
    expect(mockTransfers.listPendingFor).toHaveBeenCalledWith(COGESTOR_ID);
    expect(res.body).toHaveLength(1);
  });

  it('conta de usuário não tem prédio a receber', async () => {
    const tokenUsuario = signAccessToken('ffffffff-6666-4666-8666-666666666666', 'NONE', 'USER');

    const res = await request(app)
      .get('/ownership-transfers/me')
      .set('Authorization', `Bearer ${tokenUsuario}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
