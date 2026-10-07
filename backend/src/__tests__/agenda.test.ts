import { scheduleService, serializeSchedule, monthRange } from '../services/schedule.service';
import { scheduleJobService } from '../services/scheduleJob.service';
import { notificationService } from '../services/notification.service';
import { supervisorOverview } from '../services/supervisor.service';
import { scheduleRepository } from '../repositories/schedule.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { analyticsRepository } from '../repositories/analytics.repository';
import { planService } from '../services/plan.service';
import { usageService } from '../services/usage.service';
import { enviarEmail } from '../lib/mailer';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { createScheduleSchema, suggestionQuerySchema, updateScheduleSchema } from '../validators/schedule.validator';
import { zonedDayKey } from '../utils/timezone';

jest.mock('../repositories/schedule.repository');
jest.mock('../repositories/notification.repository');
jest.mock('../repositories/building.repository');
jest.mock('../repositories/analytics.repository');
jest.mock('../repositories/user.repository');
jest.mock('../services/plan.service');
jest.mock('../services/usage.service');
jest.mock('../lib/mailer');

const mockScheduleRepo = scheduleRepository as jest.Mocked<typeof scheduleRepository>;
const mockNotificationRepo = notificationRepository as jest.Mocked<typeof notificationRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockAnalyticsRepo = analyticsRepository as jest.Mocked<typeof analyticsRepository>;
const mockPlan = planService as jest.Mocked<typeof planService>;
const mockUsage = usageService as jest.Mocked<typeof usageService>;
const mockEmail = enviarEmail as jest.MockedFunction<typeof enviarEmail>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BUILDING = '99999999-9999-4999-8999-999999999999';
const SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';
const INSPECTOR_A = '33333333-3333-4333-8333-333333333333';
const INSPECTOR_B = '44444444-4444-4444-8444-444444444444';
const FLOOR_6 = '55555555-5555-4555-8555-555555555555';
const FLOOR_T = '66666666-6666-4666-8666-666666666666';
const OWNER_ID = '77777777-7777-4777-8777-777777777777';
const REPORT_ID = '88888888-8888-4888-8888-888888888888';

const gestor = { id: 'gestor-1', kind: 'MANAGER', role: 'NONE' } as any;
const visualizador = { id: 'viewer-1', kind: 'USER', role: 'NONE' } as any;

const d = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/** O agendamento como o repositório o devolve. */
function makeSchedule(overrides: any = {}) {
  return {
    id: SCHEDULE_ID,
    building_id: BUILDING_ID,
    inspector_id: INSPECTOR_A,
    scheduled_date: d('2030-05-10'),
    due_date: d('2030-05-12'),
    notes: null,
    status: 'PENDENTE',
    completed_at: null,
    completed_report_id: null,
    created_by_manager_id: 'gestor-1',
    created_by_user_id: null,
    updated_by_manager_id: 'gestor-1',
    updated_by_user_id: null,
    due_soon_notified_at: null,
    overdue_notified_at: null,
    created_at: new Date('2030-05-01T12:00:00Z'),
    updated_at: new Date('2030-05-01T12:00:00Z'),
    building: { id: BUILDING_ID, name: 'Edifício Aurora', owner_manager_id: OWNER_ID },
    inspector: { id: INSPECTOR_A, name: 'Ana', email: 'ana@test.com', status: 'ACTIVE' },
    floors: [
      { schedule_id: SCHEDULE_ID, floor_id: FLOOR_T, floor: { id: FLOOR_T, label: 'Térreo' } },
      { schedule_id: SCHEDULE_ID, floor_id: FLOOR_6, floor: { id: FLOOR_6, label: '6º Andar' } },
    ],
    created_by_manager: { name: 'Dona Célia' },
    created_by_user: null,
    ...overrides,
  } as any;
}

/** O papel de cada conta no prédio. */
function membros(map: Record<string, string>) {
  mockBuildingRepo.findMember.mockImplementation(((_b: string, userId: string) =>
    Promise.resolve(map[userId] ? ({ id: `m-${userId}`, role: map[userId] } as any) : null)) as any);
}

/** Os e-mails saem sem segurar a resposta: espera a fila de microtarefas esvaziar. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  membros({ [INSPECTOR_A]: 'INSPECTOR', [INSPECTOR_B]: 'INSPECTOR' });
  mockBuildingRepo.findFloorsByIds.mockImplementation(((ids: string[]) =>
    Promise.resolve(
      ids
        .filter((id) => id === FLOOR_6 || id === FLOOR_T)
        .map((id) => ({ id, building_id: BUILDING_ID, label: id === FLOOR_6 ? '6º Andar' : 'Térreo' }))
    )) as any);
  mockScheduleRepo.create.mockImplementation((async () => makeSchedule()) as any);
  mockScheduleRepo.findById.mockResolvedValue(makeSchedule());
  mockScheduleRepo.update.mockImplementation((async (_id: string, data: any) =>
    makeSchedule({
      ...data,
      ...(data.inspector_id === INSPECTOR_B && {
        inspector: { id: INSPECTOR_B, name: 'Bruno', email: 'bruno@test.com', status: 'ACTIVE' },
      }),
    })) as any);
  mockNotificationRepo.create.mockResolvedValue({} as any);
  mockPlan.resolvePlan.mockResolvedValue({ limits: { emailsPerMonth: 100 } } as any);
  mockUsage.emailsSent.mockResolvedValue(0);
  mockUsage.recordEmail.mockResolvedValue(undefined);
  mockEmail.mockResolvedValue(undefined);
  (auditRepository.log as jest.Mock).mockResolvedValue(undefined);
});

// ── Validação do corpo ────────────────────────────────────────────────────────
describe('validação da agenda', () => {
  const valido = {
    inspector_id: INSPECTOR_A,
    scheduled_date: '2030-05-10',
    due_date: '2030-05-12',
    floor_ids: [FLOOR_6],
  };

  it('aceita o corpo do contrato', () => {
    expect(createScheduleSchema.safeParse(valido).success).toBe(true);
  });

  it('recusa prazo antes da data agendada', () => {
    expect(createScheduleSchema.safeParse({ ...valido, due_date: '2030-05-09' }).success).toBe(false);
  });

  it('recusa lista de andares vazia', () => {
    expect(createScheduleSchema.safeParse({ ...valido, floor_ids: [] }).success).toBe(false);
  });

  it('recusa dia que não existe e formato fora do contrato', () => {
    expect(createScheduleSchema.safeParse({ ...valido, scheduled_date: '2030-02-31' }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...valido, scheduled_date: '10/05/2030' }).success).toBe(false);
  });

  it('recusa observação acima de 1000 caracteres e campo fora do contrato', () => {
    expect(createScheduleSchema.safeParse({ ...valido, notes: 'x'.repeat(1001) }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...valido, status: 'CONCLUIDO' }).success).toBe(false);
  });

  it('PATCH aceita corpo parcial e status, e recusa corpo vazio', () => {
    expect(updateScheduleSchema.safeParse({ status: 'CANCELADO' }).success).toBe(true);
    expect(updateScheduleSchema.safeParse({ notes: 'oi' }).success).toBe(true);
    expect(updateScheduleSchema.safeParse({}).success).toBe(false);
    expect(updateScheduleSchema.safeParse({ status: 'ATRASADO' }).success).toBe(false);
  });

  it('a sugestão lê os andares separados por vírgula', () => {
    const q = suggestionQuerySchema.parse({ floor_ids: `${FLOOR_6},${FLOOR_T}` });
    expect(q.floor_ids).toEqual([FLOOR_6, FLOOR_T]);
  });
});

// ── Criar ─────────────────────────────────────────────────────────────────────
describe('scheduleService.create', () => {
  const body = {
    inspector_id: INSPECTOR_A,
    scheduled_date: '2030-05-10',
    due_date: '2030-05-12',
    floor_ids: [FLOOR_6, FLOOR_T, FLOOR_6],
    notes: 'Olhar a casa de máquinas',
  };

  it('grava com autoria de gestor, sem andar repetido, e audita', async () => {
    const { schedule } = await scheduleService.create(BUILDING_ID, gestor, body);

    const [data, floorIds] = mockScheduleRepo.create.mock.calls[0];
    expect(floorIds).toEqual([FLOOR_6, FLOOR_T]);
    expect(data).toMatchObject({
      building_id: BUILDING_ID,
      inspector_id: INSPECTOR_A,
      scheduled_date: d('2030-05-10'),
      due_date: d('2030-05-12'),
      created_by_manager_id: 'gestor-1',
      created_by_user_id: null,
    });
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCHEDULE_CREATED', building_id: BUILDING_ID })
    );
    // O contrato: andares do mais alto para o mais baixo, autoria legível.
    expect(schedule.floors.map((f) => f.label)).toEqual(['6º Andar', 'Térreo']);
    expect(schedule.created_by).toEqual({ name: 'Dona Célia', kind: 'MANAGER' });
    expect(schedule.building_name).toBe('Edifício Aurora');
  });

  it('VIEWER grava como autor usuário', async () => {
    await scheduleService.create(BUILDING_ID, visualizador, body);
    const [data] = mockScheduleRepo.create.mock.calls[0];
    expect(data).toMatchObject({ created_by_user_id: 'viewer-1', created_by_manager_id: null });
  });

  it('recusa inspetor que não é INSPECTOR do prédio', async () => {
    membros({ [INSPECTOR_A]: 'VIEWER' });
    await expect(scheduleService.create(BUILDING_ID, gestor, body)).rejects.toBeInstanceOf(ValidationError);
    expect(mockScheduleRepo.create).not.toHaveBeenCalled();
  });

  it('recusa andar de outro prédio', async () => {
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([
      { id: FLOOR_6, building_id: OTHER_BUILDING, label: '6º Andar' },
    ] as any);
    await expect(
      scheduleService.create(BUILDING_ID, gestor, { ...body, floor_ids: [FLOOR_6] })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('recusa andar que não existe', async () => {
    mockBuildingRepo.findFloorsByIds.mockResolvedValue([]);
    await expect(scheduleService.create(BUILDING_ID, gestor, body)).rejects.toBeInstanceOf(ValidationError);
  });

  it('avisa o inspetor no sino e por e-mail, contando na cota do dono do prédio', async () => {
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockNotificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: INSPECTOR_A,
        building_id: BUILDING_ID,
        type: 'SCHEDULE_CREATED',
        payload: {
          schedule_id: SCHEDULE_ID,
          building_name: 'Edifício Aurora',
          scheduled_date: '2030-05-10',
          due_date: '2030-05-12',
          floors: ['6º Andar', 'Térreo'],
        },
      })
    );
    expect(mockEmail).toHaveBeenCalledWith('ana@test.com', expect.any(String), expect.any(String), expect.any(String));
    expect(mockUsage.recordEmail).toHaveBeenCalledWith(OWNER_ID);
  });

  it('cota estourada: o sino recebe, o e-mail não sai', async () => {
    mockUsage.emailsSent.mockResolvedValue(100);
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockNotificationRepo.create).toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockUsage.recordEmail).not.toHaveBeenCalled();
  });

  it('falha do e-mail não derruba a criação', async () => {
    mockEmail.mockRejectedValue(new Error('provedor fora'));
    await expect(scheduleService.create(BUILDING_ID, gestor, body)).resolves.toBeDefined();
    await flush();
  });

  it('falha do sino não derruba a criação', async () => {
    mockNotificationRepo.create.mockRejectedValue(new Error('banco'));
    await expect(scheduleService.create(BUILDING_ID, gestor, body)).resolves.toBeDefined();
  });
});

// ── Editar ────────────────────────────────────────────────────────────────────
describe('scheduleService.update', () => {
  it('404 para agendamento de outro prédio', async () => {
    mockScheduleRepo.findById.mockResolvedValue(makeSchedule({ building_id: OTHER_BUILDING }));
    await expect(
      scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { notes: 'x' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prazo novo antes da data já gravada é 400', async () => {
    await expect(
      scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { due_date: '2030-05-01' })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('mudar o prazo avisa SCHEDULE_UPDATED e zera os lembretes', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { due_date: '2030-05-20' });

    const [, data] = mockScheduleRepo.update.mock.calls[0];
    expect(data).toMatchObject({
      due_date: d('2030-05-20'),
      due_soon_notified_at: null,
      overdue_notified_at: null,
      updated_by_manager_id: 'gestor-1',
    });
    expect(mockNotificationRepo.create).toHaveBeenCalledTimes(1);
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_UPDATED');
  });

  it('mudar só a observação não avisa ninguém', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { notes: 'Levar escada' });
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('mesmos andares em outra ordem não contam como mudança', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { floor_ids: [FLOOR_6, FLOOR_T] });
    expect(mockScheduleRepo.update.mock.calls[0][2]).toBeUndefined();
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('trocar o inspetor: CANCELED para o antigo, CREATED para o novo', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { inspector_id: INSPECTOR_B });

    const avisos = mockNotificationRepo.create.mock.calls.map(([n]) => [n.user_id, n.type]);
    expect(avisos).toEqual([
      [INSPECTOR_A, 'SCHEDULE_CANCELED'],
      [INSPECTOR_B, 'SCHEDULE_CREATED'],
    ]);
  });

  it('trocar o inspetor: o antigo que saiu do prédio não é avisado', async () => {
    membros({ [INSPECTOR_B]: 'INSPECTOR' });
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { inspector_id: INSPECTOR_B });

    const avisos = mockNotificationRepo.create.mock.calls.map(([n]) => [n.user_id, n.type]);
    expect(avisos).toEqual([[INSPECTOR_B, 'SCHEDULE_CREATED']]);
  });

  it('cancelar avisa SCHEDULE_CANCELED e audita como cancelamento', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, visualizador, { status: 'CANCELADO' });

    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_CANCELED');
    expect(auditRepository.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SCHEDULE_CANCELED' }));
  });

  it('concluir à mão carimba a data, sem relatório, e não avisa', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { status: 'CONCLUIDO' });

    const [, data] = mockScheduleRepo.update.mock.calls[0];
    expect(data.status).toBe('CONCLUIDO');
    expect(data.completed_at).toBeInstanceOf(Date);
    expect(data.completed_report_id).toBeNull();
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('não edita campos de agendamento cancelado', async () => {
    mockScheduleRepo.findById.mockResolvedValue(makeSchedule({ status: 'CANCELADO' }));
    await expect(
      scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { due_date: '2030-05-20' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('não pula de concluído para cancelado', async () => {
    mockScheduleRepo.findById.mockResolvedValue(makeSchedule({ status: 'CONCLUIDO' }));
    await expect(
      scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { status: 'CANCELADO' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reativar o cancelado volta à agenda do inspetor como CREATED', async () => {
    mockScheduleRepo.findById.mockResolvedValue(makeSchedule({ status: 'CANCELADO' }));
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { status: 'PENDENTE' });
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_CREATED');
  });
});

// ── Leitura ───────────────────────────────────────────────────────────────────
describe('leitura da agenda', () => {
  it('INSPECTOR só recebe as próprias rondas', async () => {
    mockScheduleRepo.list.mockResolvedValue([]);
    const inspetor = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

    await scheduleService.list(BUILDING_ID, inspetor, 'INSPECTOR', {});
    expect(mockScheduleRepo.list.mock.calls[0][0]).toMatchObject({ inspector_id: INSPECTOR_A });

    await scheduleService.list(BUILDING_ID, visualizador, 'VIEWER', {});
    expect(mockScheduleRepo.list.mock.calls[1][0].inspector_id).toBeUndefined();
  });

  it('o mês vira um recorte de dias; sem mês e ano, sem recorte', () => {
    expect(monthRange({ month: 2, year: 2030 })).toEqual({ from: d('2030-02-01'), to: d('2030-02-28') });
    expect(monthRange({ year: 2030 })).toEqual({ from: d('2030-01-01'), to: d('2030-12-31') });
    expect(monthRange({})).toEqual({});
  });

  it('atrasado é PENDENTE com prazo antes de hoje', () => {
    const s = makeSchedule({ due_date: d('2030-05-12') });
    expect(serializeSchedule(s, '2030-05-13').overdue).toBe(true);
    expect(serializeSchedule(s, '2030-05-12').overdue).toBe(false);
    expect(serializeSchedule({ ...s, status: 'CONCLUIDO' }, '2030-05-13').overdue).toBe(false);
  });

  it('inspetor apagado sai como "Usuário removido"', () => {
    expect(serializeSchedule(makeSchedule({ inspector_id: null, inspector: null })).inspector).toEqual({
      id: null,
      name: 'Usuário removido',
    });
  });

  it('/me/schedules: só PENDENTE e CONCLUIDO, nos prédios que a conta enxerga', async () => {
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID]);
    mockScheduleRepo.list.mockResolvedValue([makeSchedule()]);
    const inspetor = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

    const { schedules } = await scheduleService.mine(inspetor, {});
    expect(mockScheduleRepo.list.mock.calls[0][0]).toMatchObject({
      inspector_id: INSPECTOR_A,
      building_ids: [BUILDING_ID],
      statuses: ['PENDENTE', 'CONCLUIDO'],
    });
    expect(schedules).toHaveLength(1);
  });

  it('/me/schedules de gestor é lista vazia', async () => {
    expect(await scheduleService.mine(gestor, {})).toEqual({ schedules: [] });
    expect(mockScheduleRepo.list).not.toHaveBeenCalled();
  });
});

// ── Sugestão ──────────────────────────────────────────────────────────────────
describe('scheduleService.suggestion', () => {
  it('menos pendências primeiro; no empate, quem nunca vistoriou, depois o mais antigo', async () => {
    mockScheduleRepo.listInspectors.mockResolvedValue([
      { id: 'u-carla', name: 'Carla' },
      { id: 'u-davi', name: 'Davi' },
      { id: 'u-eva', name: 'Eva' },
      { id: 'u-fabio', name: 'Fábio' },
    ]);
    mockScheduleRepo.countPendingByInspector.mockResolvedValue(
      new Map([
        ['u-carla', 2],
        ['u-davi', 0],
        ['u-eva', 0],
      ])
    );
    mockScheduleRepo.lastInspectionByInspector.mockResolvedValue(
      new Map([
        ['u-davi', d('2030-04-01')],
        ['u-eva', d('2030-03-01')],
        ['u-carla', d('2029-01-01')],
      ])
    );

    const { inspectors } = await scheduleService.suggestion(BUILDING_ID, {
      floor_ids: [FLOOR_6],
      scheduled_date: '2030-05-10',
      due_date: '2030-05-12',
    });

    // Fábio: 0 pendências e nunca vistoriou. Eva vistoriou antes de Davi.
    expect(inspectors.map((i) => i.name)).toEqual(['Fábio', 'Eva', 'Davi', 'Carla']);
    expect(inspectors.map((i) => i.suggested)).toEqual([true, false, false, false]);
    expect(inspectors[0]).toEqual({
      id: 'u-fabio',
      name: 'Fábio',
      pending_count: 0,
      last_inspected_at: null,
      suggested: true,
    });
    expect(inspectors[1].last_inspected_at).toBe('2030-03-01');

    // A sobreposição é medida no período pedido.
    expect(mockScheduleRepo.countPendingByInspector).toHaveBeenCalledWith(
      BUILDING_ID,
      ['u-carla', 'u-davi', 'u-eva', 'u-fabio'],
      d('2030-05-10'),
      d('2030-05-12')
    );
  });

  it('prédio sem inspetor devolve lista vazia', async () => {
    mockScheduleRepo.listInspectors.mockResolvedValue([]);
    mockScheduleRepo.countPendingByInspector.mockResolvedValue(new Map());
    mockScheduleRepo.lastInspectionByInspector.mockResolvedValue(new Map());
    expect(await scheduleService.suggestion(BUILDING_ID, { floor_ids: [] })).toEqual({ inspectors: [] });
  });
});

// ── Conclusão automática ──────────────────────────────────────────────────────
describe('scheduleService.completeFromReport', () => {
  const report = {
    id: REPORT_ID,
    inspector_id: INSPECTOR_A,
    building_id: BUILDING_ID,
    date: d('2030-05-11'),
    floors_inspected: [FLOOR_6, FLOOR_T],
  };

  it('conclui só a ronda cujos andares a vistoria cobriu inteiros', async () => {
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      { id: 's-coberta', floors: [{ floor_id: FLOOR_6 }, { floor_id: FLOOR_T }] },
      { id: 's-parcial', floors: [{ floor_id: FLOOR_6 }, { floor_id: 'andar-que-faltou' }] },
    ] as any);
    mockScheduleRepo.markCompleted.mockResolvedValue(1);

    await scheduleService.completeFromReport(report);

    expect(mockScheduleRepo.findPendingForCompletion).toHaveBeenCalledWith(INSPECTOR_A, BUILDING_ID, report.date);
    expect(mockScheduleRepo.markCompleted).toHaveBeenCalledWith(['s-coberta'], REPORT_ID, expect.any(Date));
    expect(auditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SCHEDULE_UPDATED', entity_id: 's-coberta' })
    );
  });

  it('nada a concluir não escreve nada', async () => {
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([]);
    await scheduleService.completeFromReport(report);
    expect(mockScheduleRepo.markCompleted).not.toHaveBeenCalled();
  });

  it('vistoria sem inspetor não procura ronda', async () => {
    await scheduleService.completeFromReport({ ...report, inspector_id: null });
    expect(mockScheduleRepo.findPendingForCompletion).not.toHaveBeenCalled();
  });
});

// ── Ciclo diário ──────────────────────────────────────────────────────────────
describe('scheduleJobService.runDaily', () => {
  const agora = new Date('2030-05-11T09:00:00Z');

  beforeEach(() => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([]);
    mockScheduleRepo.listOverdueCandidates.mockResolvedValue([]);
    mockScheduleRepo.activeInspectorPairs.mockResolvedValue(new Set([`${BUILDING_ID}:${INSPECTOR_A}`]));
  });

  it('procura o prazo de amanhã e os vencidos até ontem, no fuso do produto', async () => {
    await scheduleJobService.runDaily(agora);
    const hoje = zonedDayKey(agora);
    const amanha = new Date(`${hoje}T00:00:00.000Z`);
    amanha.setUTCDate(amanha.getUTCDate() + 1);

    expect(mockScheduleRepo.listDueSoonCandidates).toHaveBeenCalledWith(amanha);
    expect(mockScheduleRepo.listOverdueCandidates).toHaveBeenCalledWith(d(hoje));
  });

  it('avisa quem conseguiu reservar, com sino e e-mail', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    const res = await scheduleJobService.runDaily(agora);

    expect(res).toEqual({ due_soon: 1, overdue: 0 });
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_DUE_SOON');
    expect(mockEmail).toHaveBeenCalledTimes(1);
  });

  it('é idempotente: o que já foi reservado não é avisado de novo', async () => {
    mockScheduleRepo.listOverdueCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimOverdue.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const primeira = await scheduleJobService.runDaily(agora);
    const segunda = await scheduleJobService.runDaily(agora);

    expect(primeira.overdue).toBe(1);
    expect(segunda.overdue).toBe(0);
    expect(mockNotificationRepo.create).toHaveBeenCalledTimes(1);
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_OVERDUE');
  });

  it('inspetor que saiu do prédio: marca, mas não avisa', async () => {
    mockScheduleRepo.listOverdueCandidates.mockResolvedValue([
      makeSchedule({ inspector_id: INSPECTOR_B, inspector: { id: INSPECTOR_B, name: 'Bruno', email: 'b@t.com', status: 'ACTIVE' } }),
    ]);
    mockScheduleRepo.claimOverdue.mockResolvedValue(true);

    const res = await scheduleJobService.runDaily(agora);

    expect(mockScheduleRepo.claimOverdue).toHaveBeenCalled();
    expect(res.overdue).toBe(0);
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('uma falha não derruba o outro lembrete', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockRejectedValue(new Error('banco'));
    mockScheduleRepo.listOverdueCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimOverdue.mockResolvedValue(true);

    expect(await scheduleJobService.runDaily(agora)).toEqual({ due_soon: 0, overdue: 1 });
  });
});

// ── Sino ──────────────────────────────────────────────────────────────────────
describe('notificationService', () => {
  const usuario = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

  it('lista as do usuário com a contagem de não lidas', async () => {
    mockNotificationRepo.listForUser.mockResolvedValue([{ id: 'n1' }] as any);
    mockNotificationRepo.countUnread.mockResolvedValue(3);

    expect(await notificationService.list(usuario, 30)).toEqual({ notifications: [{ id: 'n1' }], unread: 3 });
    expect(mockNotificationRepo.listForUser).toHaveBeenCalledWith(INSPECTOR_A, 30);
  });

  it('marcar como lido aviso de outra conta é 404', async () => {
    mockNotificationRepo.findOwned.mockResolvedValue(null);
    await expect(notificationService.markRead(usuario, 'n-alheio')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockNotificationRepo.markRead).not.toHaveBeenCalled();
  });

  it('conta apagada não recebe aviso', async () => {
    await notificationService.notifySchedule('SCHEDULE_CREATED', makeSchedule(), {
      id: INSPECTOR_A,
      name: 'Ana',
      email: 'ana@test.com',
      status: 'DELETED',
    });
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });
});

// ── Painel do supervisor ─────────────────────────────────────────────────────
describe('supervisorOverview', () => {
  it('conta a agenda pelo prazo e ordena a cobertura por andar', async () => {
    const hoje = zonedDayKey(new Date());
    mockAnalyticsRepo.porInspetor.mockResolvedValue([
      { id: INSPECTOR_A, name: 'Ana', vistorias: 4, dias: 3, andares_distintos: 2, ocorrencias: 5 },
    ] as any);
    mockScheduleRepo.listForPeriod.mockResolvedValue([
      { status: 'PENDENTE', due_date: d('2099-01-01'), completed_at: null },
      { status: 'PENDENTE', due_date: d('2000-01-01'), completed_at: null },
      { status: 'CONCLUIDO', due_date: d('2030-05-12'), completed_at: new Date('2030-05-12T15:00:00Z') },
      { status: 'CONCLUIDO', due_date: d('2030-05-12'), completed_at: new Date('2030-05-14T15:00:00Z') },
      { status: 'CANCELADO', due_date: d('2030-05-12'), completed_at: null },
    ] as any);
    mockScheduleRepo.ticketsByStatus.mockResolvedValue({ ABERTO: 2, CONCLUIDO: 1 } as any);
    mockScheduleRepo.coverage.mockResolvedValue([
      { floor_id: FLOOR_T, label: 'Térreo', last_day: hoje },
      { floor_id: 'sub', label: '1º Subsolo', last_day: null },
      { floor_id: FLOOR_6, label: '6º Andar', last_day: hoje },
    ]);

    const res = await supervisorOverview(BUILDING_ID, { from: '2030-05-01', to: '2030-05-31' });

    expect(res.inspectors).toEqual([
      { id: INSPECTOR_A, name: 'Ana', inspections: 4, days: 3, floors: 2, occurrences: 5 },
    ]);
    expect(res.schedules).toEqual({ pending: 1, overdue: 1, done_on_time: 1, done_late: 1, canceled: 1 });
    expect(res.tickets).toEqual({ by_status: { ABERTO: 2, CONCLUIDO: 1 } });
    expect(res.coverage.map((c) => c.label)).toEqual(['6º Andar', 'Térreo', '1º Subsolo']);
    expect(res.coverage[0].days_since).toBe(0);
    expect(res.coverage[2]).toEqual({ floor_id: 'sub', label: '1º Subsolo', last_inspected_at: null, days_since: null });
    expect(mockScheduleRepo.listForPeriod).toHaveBeenCalledWith(BUILDING_ID, d('2030-05-01'), d('2030-05-31'));
  });
});
