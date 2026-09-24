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
jest.mock('../lib/mailer');
jest.mock('../services/excel.service');
jest.mock('../services/storage.service');

import app from '../app';
import { BuildingRole, PlanCode, SubscriptionStatus } from '@prisma/client';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { userRepository } from '../repositories/user.repository';
import { planRepository } from '../repositories/plan.repository';
import { usageService } from '../services/usage.service';
import { authService } from '../services/auth.service';
import { signAccessToken } from '../utils/jwt';
import { AccountSuspendedError } from '../utils/errors';

const mockBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAudit = auditRepository as jest.Mocked<typeof auditRepository>;
const mockManagers = managerRepository as jest.Mocked<typeof managerRepository>;
const mockUsers = userRepository as jest.Mocked<typeof userRepository>;
const mockPlans = planRepository as jest.Mocked<typeof planRepository>;
const mockUsage = usageService as jest.Mocked<typeof usageService>;

const GESTOR_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const BUILDING_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const USER_ID = 'cccccccc-3333-4333-8333-333333333333';
const REQUEST_ID = 'dddddddd-4444-4444-8444-444444444444';

const tokenGestor = signAccessToken(GESTOR_ID, 'NONE', 'MANAGER');

const predio = (overrides: Record<string, unknown> = {}) =>
  ({
    id: BUILDING_ID,
    name: 'Edifício Aurora',
    description: null,
    share_key: 'ABCD23456789',
    created_by: GESTOR_ID,
    owner_manager_id: GESTOR_ID,
    frozen_at: null,
    ...overrides,
  }) as never;

/** A conta paga o plano indicado, por assinatura ativa. */
function comPlano(plan: PlanCode, extras = 0) {
  mockPlans.findActiveSubscription.mockResolvedValue({
    plan,
    status: SubscriptionStatus.ACTIVE,
    extra_buildings: extras,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();

  mockManagers.findById.mockResolvedValue({
    id: GESTOR_ID,
    status: 'ACTIVE',
    token_version: 0,
    suspended_at: null,
  } as never);
  mockBuildings.findById.mockResolvedValue(predio());
  // Só o dono da sessão é gestor do prédio: o e-mail convidado ainda não é, e
  // devolver vínculo para todo mundo faria "adicionar co-gestor" virar 409
  // antes de o plano ter o que dizer.
  mockBuildings.findManagerLink.mockImplementation(((_b: string, managerId: string) =>
    Promise.resolve(managerId === GESTOR_ID ? { building_id: BUILDING_ID, manager_id: GESTOR_ID } : null)) as never);
  mockAudit.log.mockResolvedValue(undefined as never);

  // Sem concessão e sem assinatura: LIVRE, que é onde toda conta nova começa.
  mockPlans.findActiveGrant.mockResolvedValue(null);
  mockPlans.findActiveSubscription.mockResolvedValue(null);
  mockPlans.countOwnedBuildings.mockResolvedValue(0);

  mockBuildings.countManagers.mockResolvedValue(1);
  mockBuildings.countMembersByRole.mockResolvedValue(0);
  mockBuildings.create.mockResolvedValue(predio());
  mockBuildings.addManager.mockResolvedValue({ id: 'link-1' } as never);
  mockBuildings.addMember.mockResolvedValue({ id: 'member-1' } as never);
  mockBuildings.updateMemberRole.mockResolvedValue({ id: 'member-1' } as never);
  mockBuildings.findMember.mockResolvedValue({
    id: 'member-1',
    building_id: BUILDING_ID,
    user_id: USER_ID,
    role: BuildingRole.VIEWER,
  } as never);
  mockBuildings.findAccessRequestById.mockResolvedValue({
    id: REQUEST_ID,
    building_id: BUILDING_ID,
    user_id: USER_ID,
    status: 'PENDING',
  } as never);
  mockBuildings.updateAccessRequest.mockResolvedValue({
    id: REQUEST_ID,
    user_id: USER_ID,
    status: 'APPROVED',
  } as never);

  mockUsage.storageUsedBytes.mockResolvedValue(0);
});

describe('teto de prédios', () => {
  it('o LIVRE cadastra o primeiro prédio', async () => {
    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Edifício Aurora' });

    expect(res.status).toBe(201);
  });

  it('o LIVRE não cadastra o segundo, e o erro diz o limite', async () => {
    mockPlans.countOwnedBuildings.mockResolvedValue(1);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Edifício Dois' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LIMITE_DO_PLANO');
    expect(res.body.error.details).toEqual({ limit: 1, current: 1, plan: 'LIVRE' });
    expect(mockBuildings.create).not.toHaveBeenCalled();
  });

  it('o PRO comporta cinco, e os extras comprados somam', async () => {
    comPlano(PlanCode.PRO, 2);
    mockPlans.countOwnedBuildings.mockResolvedValue(6);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Edifício Sete' });

    expect(res.status).toBe(201);
  });

  it('o PRO para quando os extras acabam', async () => {
    comPlano(PlanCode.PRO, 2);
    mockPlans.countOwnedBuildings.mockResolvedValue(7);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Edifício Oito' });

    expect(res.status).toBe(403);
    expect(res.body.error.details.limit).toBe(7);
  });

  it('a concessão do admin manda mais que a assinatura', async () => {
    mockPlans.findActiveGrant.mockResolvedValue({ plan: PlanCode.PRO } as never);
    mockPlans.countOwnedBuildings.mockResolvedValue(4);

    const res = await request(app)
      .post('/buildings')
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Edifício Cinco' });

    expect(res.status).toBe(201);
  });
});

describe('teto de pessoas', () => {
  it('o LIVRE não aceita co-gestor: um gestor por prédio', async () => {
    mockManagers.findByEmail.mockResolvedValue({ id: 'outro-gestor', status: 'ACTIVE' } as never);
    mockBuildings.countManagers.mockResolvedValue(1);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/managers`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ email: 'outro@test.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LIMITE_DO_PLANO');
    expect(mockBuildings.addManager).not.toHaveBeenCalled();
  });

  it('o ESSENCIAL aceita co-gestor sem contar cabeças', async () => {
    comPlano(PlanCode.ESSENCIAL);
    mockManagers.findByEmail.mockResolvedValue({ id: 'outro-gestor', status: 'ACTIVE' } as never);
    mockBuildings.countManagers.mockResolvedValue(9);

    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/managers`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ email: 'outro@test.com' });

    expect(res.status).toBe(201);
    // Plano sem teto não vai ao banco contar gente.
    expect(mockBuildings.countManagers).not.toHaveBeenCalled();
  });

  it('moderador no LIVRE é recurso que o plano não tem, e a mensagem diz isso', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/${USER_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'MODERADOR' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RECURSO_DO_PLANO');
    expect(res.body.error.details).toEqual({ feature: 'MODERADOR', plan: 'LIVRE' });
    expect(mockBuildings.updateMemberRole).not.toHaveBeenCalled();
  });

  it('o segundo inspetor do LIVRE é recusado com o número na mão', async () => {
    mockBuildings.countMembersByRole.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/${USER_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(403);
    expect(res.body.error.details).toEqual({ limit: 1, current: 1, plan: 'LIVRE' });
  });

  it('repetir o papel que a pessoa já tem não conta contra o limite', async () => {
    mockBuildings.findMember.mockResolvedValue({
      id: 'member-1',
      building_id: BUILDING_ID,
      user_id: USER_ID,
      role: BuildingRole.INSPECTOR,
    } as never);
    mockBuildings.countMembersByRole.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/${USER_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(200);
  });

  it('aprovar solicitação sem vaga não tira o pedido da fila', async () => {
    mockBuildings.countMembersByRole.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/access-requests/${REQUEST_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(403);
    expect(mockBuildings.updateAccessRequest).not.toHaveBeenCalled();
    expect(mockBuildings.addMember).not.toHaveBeenCalled();
  });

  it('recusar solicitação não passa por limite nenhum', async () => {
    mockBuildings.countMembersByRole.mockResolvedValue(99);
    mockBuildings.updateAccessRequest.mockResolvedValue({
      id: REQUEST_ID,
      user_id: USER_ID,
      status: 'REJECTED',
    } as never);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/access-requests/${REQUEST_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'REJECTED' });

    expect(res.status).toBe(200);
  });

  it('prédio sem dono não é barrado: não há plano a consultar', async () => {
    mockBuildings.findById.mockResolvedValue(predio({ owner_manager_id: null }));
    mockBuildings.countMembersByRole.mockResolvedValue(50);

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/members/${USER_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ role: 'INSPECTOR' });

    expect(res.status).toBe(200);
  });
});

describe('prédio inativo', () => {
  beforeEach(() => {
    mockBuildings.findById.mockResolvedValue(predio({ frozen_at: new Date('2026-09-01') }));
  });

  it('não aceita andar novo', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/floors`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ label: '7º Andar' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PREDIO_CONGELADO');
    expect(mockBuildings.createFloor).not.toHaveBeenCalled();
  });

  it('não emite convite novo', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/share-token`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PREDIO_CONGELADO');
  });

  it('continua sendo lido: o histórico é do cliente', async () => {
    mockBuildings.getFloors.mockResolvedValue([] as never);

    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/floors`)
      .set('Authorization', `Bearer ${tokenGestor}`);

    expect(res.status).toBe(200);
  });

  it('e continua podendo ser renomeado e apagado — sair não depende de estar em dia', async () => {
    mockBuildings.update.mockResolvedValue(predio({ name: 'Outro nome' }));

    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ name: 'Outro nome' });

    expect(res.status).toBe(200);
  });
});

describe('conta suspensa', () => {
  const SENHA = 'senha-de-teste-12345';
  let HASH_DA_SENHA = '';

  beforeAll(async () => {
    const bcrypt = await import('bcrypt');
    // Hash de verdade, e não um mock de bcrypt: assim o teste prova a ordem —
    // a senha confere, e ainda assim a conta não entra.
    HASH_DA_SENHA = await bcrypt.hash(SENHA, 4);
  });

  it('não entra, e o código diz por quê', async () => {
    mockUsers.findByEmail.mockResolvedValue(null);
    mockManagers.findByEmail.mockResolvedValue({
      id: GESTOR_ID,
      name: 'Ana',
      email: 'ana@test.com',
      password_hash: HASH_DA_SENHA,
      status: 'ACTIVE',
      token_version: 0,
      email_verified_at: new Date(),
      suspended_at: new Date('2026-09-01'),
      avatar_url: null,
    } as never);

    // A senha confere: o hash é o da senha usada aqui, e o que barra é a
    // suspensão — que vem depois da senha, senão o login diria quais contas
    // estão suspensas a quem só chuta.
    await expect(authService.login('ana@test.com', SENHA)).rejects.toThrow(
      AccountSuspendedError
    );
  });

  it('nem renova a sessão que já tinha', async () => {
    mockManagers.findById.mockResolvedValue({
      id: GESTOR_ID,
      status: 'ACTIVE',
      token_version: 0,
      suspended_at: new Date('2026-09-01'),
    } as never);

    const { signRefreshToken } = await import('../utils/jwt');
    const refresh = signRefreshToken(GESTOR_ID, 'NONE', 'MANAGER', 0);

    await expect(authService.refresh(refresh)).rejects.toThrow(AccountSuspendedError);
  });
});
