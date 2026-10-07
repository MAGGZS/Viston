import request from 'supertest';

// O alvo aqui é a cadeia de guardas das rotas da agenda — vínculo, papel e
// prédio ativo —, não o banco. Todo repositório que essas rotas tocam é mock.
jest.mock('../repositories/building.repository');
jest.mock('../repositories/schedule.repository');
jest.mock('../repositories/notification.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../repositories/plan.repository');
jest.mock('../repositories/usage.repository');
jest.mock('../lib/mailer');

import app from '../app';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { scheduleRepository } from '../repositories/schedule.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { analyticsRepository } from '../repositories/analytics.repository';
import { config } from '../config';
import { signAccessToken } from '../utils/jwt';

const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockScheduleRepo = scheduleRepository as jest.Mocked<typeof scheduleRepository>;
const mockNotificationRepo = notificationRepository as jest.Mocked<typeof notificationRepository>;
const mockAnalyticsRepo = analyticsRepository as jest.Mocked<typeof analyticsRepository>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';
const INSPECTOR_ID = '33333333-3333-4333-8333-333333333333';
const FLOOR_ID = '55555555-5555-4555-8555-555555555555';
const GESTOR_ID = 'a1111111-1111-4111-8111-111111111111';
const VIEWER_ID = 'c2222222-2222-4222-8222-222222222222';
const MODERADOR_ID = 'd3333333-3333-4333-8333-333333333333';
const NOTIFICATION_ID = 'e4444444-4444-4444-8444-444444444444';

const tokenGestor = signAccessToken(GESTOR_ID, 'NONE', 'MANAGER');
const tokenViewer = signAccessToken(VIEWER_ID, 'NONE');
const tokenInspector = signAccessToken(INSPECTOR_ID, 'NONE');
const tokenModerador = signAccessToken(MODERADOR_ID, 'NONE');
const tokenSemVinculo = signAccessToken('f5555555-5555-4555-8555-555555555555', 'NONE');

const building = { id: BUILDING_ID, name: 'Edifício Aurora', owner_manager_id: null, frozen_at: null };

/** O papel de cada conta neste prédio; o gestor responde por `findManagerLink`. */
function papeis() {
  const porUsuario: Record<string, string> = {
    [VIEWER_ID]: 'VIEWER',
    [INSPECTOR_ID]: 'INSPECTOR',
    [MODERADOR_ID]: 'MODERADOR',
  };
  mockBuildingRepo.findMember.mockImplementation(((_b: string, userId: string) =>
    Promise.resolve(porUsuario[userId] ? ({ id: 'm', role: porUsuario[userId] } as any) : null)) as any);
  mockBuildingRepo.findManagerLink.mockImplementation(((_b: string, managerId: string) =>
    Promise.resolve(managerId === GESTOR_ID ? ({ id: 'bm' } as any) : null)) as any);
}

function makeSchedule(overrides: any = {}) {
  return {
    id: SCHEDULE_ID,
    building_id: BUILDING_ID,
    inspector_id: INSPECTOR_ID,
    scheduled_date: new Date('2030-05-10T00:00:00Z'),
    due_date: new Date('2030-05-12T00:00:00Z'),
    notes: null,
    status: 'PENDENTE',
    completed_at: null,
    completed_report_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    building: { id: BUILDING_ID, name: 'Edifício Aurora', owner_manager_id: null },
    inspector: { id: INSPECTOR_ID, name: 'Ana', email: 'ana@test.com', status: 'ACTIVE' },
    floors: [{ schedule_id: SCHEDULE_ID, floor_id: FLOOR_ID, floor: { id: FLOOR_ID, label: '2º Andar' } }],
    created_by_manager: { name: 'Gestora' },
    created_by_user: null,
    ...overrides,
  } as any;
}

const corpo = {
  inspector_id: INSPECTOR_ID,
  scheduled_date: '2030-05-10',
  due_date: '2030-05-12',
  floor_ids: [FLOOR_ID],
};

beforeEach(() => {
  jest.clearAllMocks();
  papeis();
  (auditRepository.log as jest.Mock).mockResolvedValue(undefined);
  mockBuildingRepo.findById.mockResolvedValue(building as any);
  mockBuildingRepo.findFloorsByIds.mockResolvedValue([{ id: FLOOR_ID, building_id: BUILDING_ID, label: '2º Andar' }] as any);
  mockScheduleRepo.create.mockResolvedValue(makeSchedule());
  mockScheduleRepo.findById.mockResolvedValue(makeSchedule());
  mockScheduleRepo.update.mockResolvedValue(makeSchedule({ status: 'CANCELADO' }));
  mockScheduleRepo.list.mockResolvedValue([makeSchedule()]);
  mockScheduleRepo.listInspectors.mockResolvedValue([{ id: INSPECTOR_ID, name: 'Ana' }]);
  mockScheduleRepo.countPendingByInspector.mockResolvedValue(new Map());
  mockScheduleRepo.lastInspectionByInspector.mockResolvedValue(new Map());
  mockScheduleRepo.listForPeriod.mockResolvedValue([]);
  mockScheduleRepo.ticketsByStatus.mockResolvedValue({} as any);
  mockScheduleRepo.coverage.mockResolvedValue([]);
  mockAnalyticsRepo.porInspetor.mockResolvedValue([]);
  mockNotificationRepo.create.mockResolvedValue({} as any);
});

describe('POST /buildings/:id/schedules', () => {
  it('gestor cria: 201 com o agendamento no contrato', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send(corpo);

    expect(res.status).toBe(201);
    expect(res.body.schedule).toMatchObject({
      id: SCHEDULE_ID,
      building_id: BUILDING_ID,
      building_name: 'Edifício Aurora',
      inspector: { id: INSPECTOR_ID, name: 'Ana' },
      scheduled_date: '2030-05-10',
      due_date: '2030-05-12',
      status: 'PENDENTE',
      overdue: false,
      floors: [{ id: FLOOR_ID, label: '2º Andar' }],
      created_by: { name: 'Gestora', kind: 'MANAGER' },
    });
  });

  it('VIEWER cria', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send(corpo);
    expect(res.status).toBe(201);
  });

  it.each([
    ['INSPECTOR', tokenInspector],
    ['MODERADOR', tokenModerador],
    ['sem vínculo', tokenSemVinculo],
  ])('%s não cria (403)', async (_papel, token) => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send(corpo);
    expect(res.status).toBe(403);
    expect(mockScheduleRepo.create).not.toHaveBeenCalled();
  });

  it('prédio congelado não aceita agendamento', async () => {
    mockBuildingRepo.findById.mockResolvedValue({ ...building, frozen_at: new Date() } as any);
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send(corpo);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PREDIO_CONGELADO');
  });

  it('prazo antes da data é 400', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ ...corpo, due_date: '2030-05-01' });
    expect(res.status).toBe(400);
  });

  it('inspetor que não é INSPECTOR do prédio é 400', async () => {
    const res = await request(app)
      .post(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ ...corpo, inspector_id: VIEWER_ID });
    expect(res.status).toBe(400);
    expect(mockScheduleRepo.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /buildings/:id/schedules/:scheduleId', () => {
  it('VIEWER cancela', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/schedules/${SCHEDULE_ID}`)
      .set('Authorization', `Bearer ${tokenViewer}`)
      .send({ status: 'CANCELADO' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.status).toBe('CANCELADO');
  });

  it('INSPECTOR não mexe (403)', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/schedules/${SCHEDULE_ID}`)
      .set('Authorization', `Bearer ${tokenInspector}`)
      .send({ status: 'CONCLUIDO' });
    expect(res.status).toBe(403);
    expect(mockScheduleRepo.update).not.toHaveBeenCalled();
  });

  it('id que não é UUID é 404', async () => {
    const res = await request(app)
      .patch(`/buildings/${BUILDING_ID}/schedules/nao-e-uuid`)
      .set('Authorization', `Bearer ${tokenGestor}`)
      .send({ status: 'CANCELADO' });
    expect(res.status).toBe(404);
  });
});

describe('GET /buildings/:id/schedules', () => {
  it('INSPECTOR lê, mas só as próprias rondas', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/schedules?month=5&year=2030`)
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(1);
    expect(mockScheduleRepo.list.mock.calls[0][0]).toMatchObject({
      building_id: BUILDING_ID,
      inspector_id: INSPECTOR_ID,
    });
  });

  it('MODERADOR lê a agenda inteira', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/schedules?status=PENDENTE`)
      .set('Authorization', `Bearer ${tokenModerador}`);
    expect(res.status).toBe(200);
    expect(mockScheduleRepo.list.mock.calls[0][0].inspector_id).toBeUndefined();
    expect(mockScheduleRepo.list.mock.calls[0][0].statuses).toEqual(['PENDENTE']);
  });

  it('sem vínculo não lê (403)', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/schedules`)
      .set('Authorization', `Bearer ${tokenSemVinculo}`);
    expect(res.status).toBe(403);
  });
});

describe('sugestão e painel do supervisor', () => {
  it('gestor recebe a sugestão', async () => {
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/schedules/suggestion?floor_ids=${FLOOR_ID}`)
      .set('Authorization', `Bearer ${tokenGestor}`);
    expect(res.status).toBe(200);
    expect(res.body.inspectors[0]).toEqual({
      id: INSPECTOR_ID,
      name: 'Ana',
      pending_count: 0,
      last_inspected_at: null,
      suggested: true,
    });
  });

  it('INSPECTOR não vê a sugestão nem o painel', async () => {
    const sugestao = await request(app)
      .get(`/buildings/${BUILDING_ID}/schedules/suggestion`)
      .set('Authorization', `Bearer ${tokenInspector}`);
    const painel = await request(app)
      .get(`/buildings/${BUILDING_ID}/supervisor/overview`)
      .set('Authorization', `Bearer ${tokenInspector}`);
    expect(sugestao.status).toBe(403);
    expect(painel.status).toBe(403);
  });

  it('VIEWER vê o painel, mesmo de prédio congelado', async () => {
    mockBuildingRepo.findById.mockResolvedValue({ ...building, frozen_at: new Date() } as any);
    const res = await request(app)
      .get(`/buildings/${BUILDING_ID}/supervisor/overview?from=2030-05-01&to=2030-05-31`)
      .set('Authorization', `Bearer ${tokenViewer}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['inspectors', 'schedules', 'tickets', 'coverage']);
  });
});

describe('/me', () => {
  it('GET /me/notifications devolve a lista e as não lidas', async () => {
    mockNotificationRepo.listForUser.mockResolvedValue([]);
    mockNotificationRepo.countUnread.mockResolvedValue(2);
    const res = await request(app)
      .get('/me/notifications?limit=10')
      .set('Authorization', `Bearer ${tokenInspector}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ notifications: [], unread: 2 });
  });

  it('PATCH read e read-all respondem 204', async () => {
    mockNotificationRepo.findOwned.mockResolvedValue({ id: NOTIFICATION_ID } as any);
    mockNotificationRepo.markRead.mockResolvedValue({ count: 1 } as any);
    mockNotificationRepo.markAllRead.mockResolvedValue({ count: 3 } as any);

    const um = await request(app)
      .patch(`/me/notifications/${NOTIFICATION_ID}/read`)
      .set('Authorization', `Bearer ${tokenInspector}`);
    const todos = await request(app)
      .patch('/me/notifications/read-all')
      .set('Authorization', `Bearer ${tokenInspector}`);

    expect(um.status).toBe(204);
    expect(todos.status).toBe(204);
  });

  it('GET /me/schedules exige sessão', async () => {
    const res = await request(app).get('/me/schedules');
    expect(res.status).toBe(401);
  });
});

describe('POST /jobs/agenda', () => {
  it('sem o segredo é 404', async () => {
    const res = await request(app).post('/jobs/agenda');
    expect(res.status).toBe(404);
  });

  it('com o segredo roda o ciclo', async () => {
    const original = config.jobSecret;
    (config as any).jobSecret = 'segredo-de-teste-agenda';
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([]);
    mockScheduleRepo.listOverdueCandidates.mockResolvedValue([]);
    try {
      const res = await request(app).post('/jobs/agenda').set('X-Job-Secret', 'segredo-de-teste-agenda');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ due_soon: 0, overdue: 0 });
    } finally {
      (config as any).jobSecret = original;
    }
  });
});
