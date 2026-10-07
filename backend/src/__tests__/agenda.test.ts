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
import { ConflictError, NotFoundError, ScheduleChangedError, ValidationError } from '../utils/errors';
import {
  createScheduleSchema,
  mySchedulesQuerySchema,
  overviewQuerySchema,
  suggestionQuerySchema,
  updateScheduleSchema,
} from '../validators/schedule.validator';
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

/** Contas suspensas: o vínculo existe, mas não vale como inspetor ativo. */
let suspensos = new Set<string>();

/** O papel de cada conta no prédio (vale para `findMember` e para os pares ativos). */
function membros(map: Record<string, string>) {
  mockBuildingRepo.findMember.mockImplementation(((_b: string, userId: string) =>
    Promise.resolve(map[userId] ? ({ id: `m-${userId}`, role: map[userId] } as any) : null)) as any);
  mockScheduleRepo.activeInspectorPairs.mockImplementation((async (
    pairs: Array<{ building_id: string; user_id: string }>
  ) =>
    new Set(
      pairs
        .filter((p) => p.building_id === BUILDING_ID && map[p.user_id] === 'INSPECTOR' && !suspensos.has(p.user_id))
        .map((p) => `${p.building_id}:${p.user_id}`)
    )) as any);
}

/** Os e-mails saem sem segurar a resposta: espera a fila de microtarefas esvaziar. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  suspensos = new Set();
  membros({ [INSPECTOR_A]: 'INSPECTOR', [INSPECTOR_B]: 'INSPECTOR' });
  mockBuildingRepo.findFloorsByIds.mockImplementation(((ids: string[]) =>
    Promise.resolve(
      ids
        .filter((id) => id === FLOOR_6 || id === FLOOR_T)
        .map((id) => ({ id, building_id: BUILDING_ID, label: id === FLOOR_6 ? '6º Andar' : 'Térreo' }))
    )) as any);
  mockScheduleRepo.create.mockImplementation((async () => makeSchedule()) as any);
  mockScheduleRepo.findById.mockResolvedValue(makeSchedule());
  mockScheduleRepo.updateIfUnchanged.mockImplementation((async (_id: string, _esperado: any, data: any) =>
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
  mockUsage.reserveEmail.mockResolvedValue(true);
  mockUsage.reserveDailyEmail.mockResolvedValue(true);
  mockUsage.releaseEmail.mockResolvedValue(undefined);
  mockUsage.releaseDailyEmail.mockResolvedValue(undefined);
  mockScheduleRepo.listReportsForCoverage.mockResolvedValue([]);
  mockScheduleRepo.listInspectors.mockResolvedValue([{ id: INSPECTOR_A, name: 'Ana' }] as any);
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
    // A cota é reservada no banco antes do envio, com o limite do plano do dono.
    expect(mockUsage.reserveEmail).toHaveBeenCalledWith(OWNER_ID, 100, undefined);
    expect(mockUsage.reserveDailyEmail).toHaveBeenCalledWith('AGENDA', 150, zonedDayKey(new Date()));
    expect(mockUsage.emailsSent).not.toHaveBeenCalled();
    expect(mockUsage.recordEmail).not.toHaveBeenCalled();
  });

  it('cota no limite exato: a reserva falha, o sino recebe, o e-mail não sai', async () => {
    // O banco recusa a 101ª: `emails_sent < 100` é falso com o contador em 100.
    mockUsage.reserveEmail.mockResolvedValue(false);
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockNotificationRepo.create).toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockUsage.reserveDailyEmail).not.toHaveBeenCalled();
  });

  it('teto diário do sistema atingido: devolve a reserva do mês e não manda', async () => {
    mockUsage.reserveDailyEmail.mockResolvedValue(false);
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockNotificationRepo.create).toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockUsage.releaseEmail).toHaveBeenCalledWith(OWNER_ID, undefined);
  });

  it('provedor recusou: as duas reservas voltam', async () => {
    mockEmail.mockRejectedValue(new Error('provedor fora'));
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockUsage.releaseEmail).toHaveBeenCalledWith(OWNER_ID, undefined);
    expect(mockUsage.releaseDailyEmail).toHaveBeenCalledWith('AGENDA', zonedDayKey(new Date()));
  });

  it('prédio sem dono: só o sino, nenhum e-mail e nenhuma cota', async () => {
    mockScheduleRepo.create.mockResolvedValue(
      makeSchedule({ building: { id: BUILDING_ID, name: 'Edifício Aurora', owner_manager_id: null } })
    );
    await scheduleService.create(BUILDING_ID, gestor, body);
    await flush();

    expect(mockNotificationRepo.create).toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockUsage.reserveEmail).not.toHaveBeenCalled();
    expect(mockPlan.resolvePlan).not.toHaveBeenCalled();
  });

  it('recusa inspetor com a conta suspensa', async () => {
    suspensos.add(INSPECTOR_A);
    await expect(scheduleService.create(BUILDING_ID, gestor, body)).rejects.toBeInstanceOf(ValidationError);
    expect(mockScheduleRepo.create).not.toHaveBeenCalled();
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

    const [, , data] = mockScheduleRepo.updateIfUnchanged.mock.calls[0];
    expect(data).toMatchObject({
      due_date: d('2030-05-20'),
      due_soon_notified_at: null,
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
    expect(mockScheduleRepo.updateIfUnchanged.mock.calls[0][3]).toBeUndefined();
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

    const [, , data] = mockScheduleRepo.updateIfUnchanged.mock.calls[0];
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

  it('grava só se status e updated_at ainda são os da leitura', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { notes: 'x' });
    const [id, esperado] = mockScheduleRepo.updateIfUnchanged.mock.calls[0];
    expect(id).toBe(SCHEDULE_ID);
    expect(esperado).toEqual({ status: 'PENDENTE', updated_at: new Date('2030-05-01T12:00:00Z') });
  });

  it('409 AGENDAMENTO_ALTERADO quando outra escrita chegou antes: sem auditoria e sem aviso', async () => {
    mockScheduleRepo.updateIfUnchanged.mockResolvedValue(null);
    const err = await scheduleService
      .update(BUILDING_ID, SCHEDULE_ID, gestor, { due_date: '2030-05-20' })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ScheduleChangedError);
    expect(err).toMatchObject({
      statusCode: 409,
      code: 'AGENDAMENTO_ALTERADO',
      message: 'O agendamento mudou. Recarregue e tente de novo.',
    });
    expect(auditRepository.log).not.toHaveBeenCalled();
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('cancelar limpa completed_at e completed_report_id', async () => {
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { status: 'CANCELADO' });
    const [, , data] = mockScheduleRepo.updateIfUnchanged.mock.calls[0];
    expect(data).toMatchObject({ status: 'CANCELADO', completed_at: null, completed_report_id: null });
  });

  it('trocar para inspetor suspenso é 400', async () => {
    suspensos.add(INSPECTOR_B);
    await expect(
      scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { inspector_id: INSPECTOR_B })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockScheduleRepo.updateIfUnchanged).not.toHaveBeenCalled();
  });

  it('reativar o cancelado volta à agenda do inspetor como CREATED', async () => {
    mockScheduleRepo.findById.mockResolvedValue(makeSchedule({ status: 'CANCELADO' }));
    await scheduleService.update(BUILDING_ID, SCHEDULE_ID, gestor, { status: 'PENDENTE' });
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_CREATED');
  });
});

// ── Leitura ───────────────────────────────────────────────────────────────────
describe('leitura da agenda', () => {
  it('a agenda do prédio não recorta por inspetor (o INSPECTOR vê tudo, só leitura)', async () => {
    mockScheduleRepo.list.mockResolvedValue([]);
    await scheduleService.list(BUILDING_ID, {});
    expect(mockScheduleRepo.list.mock.calls[0][0].inspector_id).toBeUndefined();
  });

  it('filtro status; sem mês e ano, take 500; com mês, sem take', async () => {
    mockScheduleRepo.list.mockResolvedValue([]);
    await scheduleService.list(BUILDING_ID, { status: 'CONCLUIDO' });
    expect(mockScheduleRepo.list.mock.calls[0]).toEqual([
      { building_id: BUILDING_ID, statuses: ['CONCLUIDO'] },
      500,
    ]);

    await scheduleService.list(BUILDING_ID, { month: 5, year: 2030 });
    expect(mockScheduleRepo.list.mock.calls[1][1]).toBeUndefined();
  });

  it('inspector_left: true quando o inspetor não é mais INSPECTOR ativo, em uma consulta só', async () => {
    membros({ [INSPECTOR_A]: 'INSPECTOR' });
    mockScheduleRepo.list.mockResolvedValue([
      makeSchedule(),
      makeSchedule({ id: 's2' }),
      makeSchedule({
        id: 's3',
        inspector_id: INSPECTOR_B,
        inspector: { id: INSPECTOR_B, name: 'Bruno', email: 'b@t.com', status: 'ACTIVE' },
      }),
      makeSchedule({ id: 's4', inspector_id: null, inspector: null }),
    ]);

    const { schedules } = await scheduleService.list(BUILDING_ID, {});
    expect(schedules.map((x) => x.inspector_left)).toEqual([false, false, true, true]);
    expect(mockScheduleRepo.activeInspectorPairs).toHaveBeenCalledTimes(1);
    expect(mockScheduleRepo.activeInspectorPairs.mock.calls[0][0]).toHaveLength(2);
  });

  it('o mês vira um recorte de dias; sem mês e ano, sem recorte', () => {
    expect(monthRange({ month: 2, year: 2030 })).toEqual({ from: d('2030-02-01'), to: d('2030-02-28') });
    expect(monthRange({ year: 2030 })).toEqual({ from: d('2030-01-01'), to: d('2030-12-31') });
    expect(monthRange({})).toEqual({});
  });

  it('atraso conta do dia agendado; o prazo é o limite final', () => {
    // Agendada 10/05, prazo 12/05.
    const s = makeSchedule();
    expect(serializeSchedule(s, '2030-05-10')).toMatchObject({ overdue: false, past_deadline: false });
    expect(serializeSchedule(s, '2030-05-11')).toMatchObject({ overdue: true, past_deadline: false });
    expect(serializeSchedule(s, '2030-05-13')).toMatchObject({ overdue: true, past_deadline: true });
    expect(serializeSchedule({ ...s, status: 'CONCLUIDO' }, '2030-05-13')).toMatchObject({
      overdue: false,
      past_deadline: false,
    });
  });

  it('completed_late: concluída num dia depois do agendado', () => {
    const noDia = makeSchedule({ status: 'CONCLUIDO', completed_at: new Date('2030-05-10T15:00:00Z') });
    const depois = makeSchedule({ status: 'CONCLUIDO', completed_at: new Date('2030-05-11T15:00:00Z') });
    expect(serializeSchedule(noDia).completed_late).toBe(false);
    expect(serializeSchedule(depois).completed_late).toBe(true);
    expect(serializeSchedule(makeSchedule()).completed_late).toBe(false);
  });

  it('?overdue=true: PENDENTE agendadas antes de hoje, sem recorte de mês', async () => {
    mockScheduleRepo.list.mockResolvedValue([]);
    await scheduleService.list(BUILDING_ID, { overdue: true, month: 5, year: 2030 });

    expect(mockScheduleRepo.list.mock.calls[0][0]).toEqual({
      building_id: BUILDING_ID,
      statuses: ['PENDENTE'],
      scheduled_before: d(zonedDayKey(new Date())),
    });
    expect(mockScheduleRepo.list.mock.calls[0][1]).toBe(500);
  });

  it('/me/schedules?building_id: só aquele prédio; prédio sem vínculo é lista vazia', async () => {
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID, OTHER_BUILDING]);
    mockScheduleRepo.list.mockResolvedValue([]);
    const inspetor = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

    await scheduleService.mine(inspetor, { building_id: OTHER_BUILDING });
    expect(mockScheduleRepo.list.mock.calls[0][0].building_ids).toEqual([OTHER_BUILDING]);

    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID]);
    expect(await scheduleService.mine(inspetor, { building_id: OTHER_BUILDING })).toEqual({ schedules: [] });
    expect(mockScheduleRepo.list).toHaveBeenCalledTimes(1);
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
    expect(mockScheduleRepo.list.mock.calls[0][1]).toBe(500);
    expect(schedules).toHaveLength(1);
  });

  it('/me/schedules?status: um status só; CANCELADO é recusado pelo schema', async () => {
    mockBuildingRepo.getMemberBuildingIds.mockResolvedValue([BUILDING_ID]);
    mockScheduleRepo.list.mockResolvedValue([]);
    const inspetor = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

    await scheduleService.mine(inspetor, { status: 'CONCLUIDO', month: 5, year: 2030 });
    expect(mockScheduleRepo.list.mock.calls[0][0].statuses).toEqual(['CONCLUIDO']);
    expect(mockScheduleRepo.list.mock.calls[0][1]).toBeUndefined();

    expect(mySchedulesQuerySchema.safeParse({ status: 'PENDENTE' }).success).toBe(true);
    expect(mySchedulesQuerySchema.safeParse({ status: 'CANCELADO' }).success).toBe(false);
  });

  it('completed_late respeita o fuso: 23:30 em São Paulo ainda é o dia agendado', () => {
    // 2030-05-10 23:30 em São Paulo (UTC-3) = 2030-05-11 02:30 UTC.
    const tarde = makeSchedule({ status: 'CONCLUIDO', completed_at: new Date('2030-05-11T02:30:00Z') });
    const madrugada = makeSchedule({ status: 'CONCLUIDO', completed_at: new Date('2030-05-11T03:30:00Z') });
    expect(serializeSchedule(tarde).completed_late).toBe(false);
    expect(serializeSchedule(madrugada).completed_late).toBe(true);
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

  it('conclui também a ronda já passada do prazo', async () => {
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      { id: 's-vencida', scheduled_date: d('2030-05-10'), floors: [{ floor_id: FLOOR_6 }] },
    ] as any);
    mockScheduleRepo.markCompleted.mockResolvedValue(['s-vencida']);

    // Vistoria muito depois do prazo: o único corte é o dia agendado.
    await scheduleService.completeFromReport({ ...report, date: d('2031-01-01') });

    expect(mockScheduleRepo.markCompleted).toHaveBeenCalledWith(['s-vencida'], REPORT_ID, expect.any(Date));
  });

  it('conclui só a ronda cujos andares a vistoria cobriu inteiros', async () => {
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      { id: 's-coberta', scheduled_date: d('2030-05-10'), floors: [{ floor_id: FLOOR_6 }, { floor_id: FLOOR_T }] },
      {
        id: 's-parcial',
        scheduled_date: d('2030-05-10'),
        floors: [{ floor_id: FLOOR_6 }, { floor_id: 'andar-que-faltou' }],
      },
    ] as any);
    mockScheduleRepo.markCompleted.mockResolvedValue(['s-coberta']);

    await scheduleService.completeFromReport(report);

    expect(mockScheduleRepo.findPendingForCompletion).toHaveBeenCalledWith(INSPECTOR_A, BUILDING_ID, report.date);
    expect(mockScheduleRepo.markCompleted).toHaveBeenCalledWith(['s-coberta'], REPORT_ID, expect.any(Date));
    expect(auditRepository.logMany).toHaveBeenCalledWith([
      expect.objectContaining({ action: 'SCHEDULE_UPDATED', entity_id: 's-coberta', user_id: INSPECTOR_A }),
    ]);
  });

  it('soma as vistorias desde o dia agendado: a segunda ida fecha a ronda', async () => {
    const ANDAR_3 = 'andar-3';
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      {
        id: 's-duas-idas',
        scheduled_date: d('2030-05-10'),
        floors: [{ floor_id: FLOOR_6 }, { floor_id: FLOOR_T }, { floor_id: ANDAR_3 }],
      },
    ] as any);
    mockScheduleRepo.listReportsForCoverage.mockResolvedValue([
      // Antes do dia agendado: não conta.
      { id: 'r-velha', date: d('2030-05-09'), floors_inspected: [ANDAR_3] },
      { id: 'r-primeira', date: d('2030-05-10'), floors_inspected: [FLOOR_6] },
    ] as any);
    mockScheduleRepo.markCompleted.mockResolvedValue(['s-duas-idas']);

    // Esta só viu o Térreo: com a primeira, faltam andares (o 3º só foi visto antes).
    expect(await scheduleService.completeFromReport({ ...report, floors_inspected: [FLOOR_T] })).toBe(0);
    expect(mockScheduleRepo.markCompleted).not.toHaveBeenCalled();

    mockScheduleRepo.listReportsForCoverage.mockResolvedValue([
      { id: 'r-primeira', date: d('2030-05-10'), floors_inspected: [FLOOR_6] },
      { id: 'r-segunda', date: d('2030-05-11'), floors_inspected: [ANDAR_3] },
    ] as any);
    expect(await scheduleService.completeFromReport({ ...report, floors_inspected: [FLOOR_T] })).toBe(1);
    expect(mockScheduleRepo.listReportsForCoverage).toHaveBeenLastCalledWith(
      INSPECTOR_A,
      BUILDING_ID,
      d('2030-05-10'),
      report.date
    );
    // `completed_report_id` é a vistoria que completou a cobertura.
    expect(mockScheduleRepo.markCompleted).toHaveBeenCalledWith(['s-duas-idas'], REPORT_ID, expect.any(Date));
  });

  it('audita só os ids que o UPDATE concluiu de fato', async () => {
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      { id: 's-a', scheduled_date: d('2030-05-10'), floors: [{ floor_id: FLOOR_6 }] },
      { id: 's-cancelada-no-meio', scheduled_date: d('2030-05-10'), floors: [{ floor_id: FLOOR_T }] },
    ] as any);
    mockScheduleRepo.markCompleted.mockResolvedValue(['s-a']);

    expect(await scheduleService.completeFromReport(report)).toBe(1);
    const auditados = (auditRepository.logMany as jest.Mock).mock.calls[0][0].map((r: any) => r.entity_id);
    expect(auditados).toEqual(['s-a']);
    expect(auditRepository.log).not.toHaveBeenCalled();
  });

  it('inspetor que não é mais INSPECTOR ativo não fecha ronda (fica para redistribuir)', async () => {
    suspensos.add(INSPECTOR_A);
    mockScheduleRepo.findPendingForCompletion.mockResolvedValue([
      { id: 's-a', scheduled_date: d('2030-05-10'), floors: [{ floor_id: FLOOR_6 }] },
    ] as any);
    expect(await scheduleService.completeFromReport(report)).toBe(0);
    expect(mockScheduleRepo.markCompleted).not.toHaveBeenCalled();
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
    mockScheduleRepo.activeInspectorPairs.mockResolvedValue(new Set([`${BUILDING_ID}:${INSPECTOR_A}`]));
  });

  it('procura prazo de hoje a amanhã, no fuso do produto', async () => {
    await scheduleJobService.runDaily(agora);
    const hoje = d(zonedDayKey(agora));
    const amanha = new Date(hoje);
    amanha.setUTCDate(amanha.getUTCDate() + 1);

    expect(mockScheduleRepo.listDueSoonCandidates).toHaveBeenCalledWith(hoje, amanha);
  });

  it('prazo hoje: o e-mail diz "vence hoje"; prazo amanhã: "vence amanhã"', async () => {
    const hoje = zonedDayKey(agora);
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([
      makeSchedule({ id: 's-hoje', scheduled_date: d('2030-05-01'), due_date: d(hoje) }),
      makeSchedule({ id: 's-amanha', scheduled_date: d('2030-05-01'), due_date: d('2030-05-12') }),
    ]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    await scheduleJobService.runDaily(agora);

    const assuntos = mockEmail.mock.calls.map((c) => c[1]);
    expect(assuntos[0]).toMatch(/vence hoje/);
    expect(assuntos[1]).toMatch(/vence amanhã/);
  });

  it('resolve o plano de cada dono uma vez por ciclo (cache local)', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([makeSchedule(), makeSchedule({ id: 's2' })]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    await scheduleJobService.runDaily(agora);

    // Os dois envios passam o mesmo objeto de escopo para a cache do plano.
    const escopos = mockPlan.resolvePlan.mock.calls.map((c) => c[1]);
    expect(escopos).toHaveLength(2);
    expect(escopos[0]).toBeDefined();
    expect(escopos[0]).toBe(escopos[1]);
    expect(mockUsage.emailsSent).not.toHaveBeenCalled();
  });

  it('avisa quem conseguiu reservar, com sino e e-mail', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    const res = await scheduleJobService.runDaily(agora);

    expect(res).toEqual({ due_soon: 1 });
    expect(mockNotificationRepo.create.mock.calls[0][0].type).toBe('SCHEDULE_DUE_SOON');
    expect(mockEmail).toHaveBeenCalledTimes(1);
  });

  it('é idempotente: o que já foi reservado não é avisado de novo', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimDueSoon.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const primeira = await scheduleJobService.runDaily(agora);
    const segunda = await scheduleJobService.runDaily(agora);

    expect(primeira.due_soon).toBe(1);
    expect(segunda.due_soon).toBe(0);
    expect(mockNotificationRepo.create).toHaveBeenCalledTimes(1);
  });

  it('não manda aviso de atraso: o atraso é só visual', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([makeSchedule()]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    await scheduleJobService.runDaily(agora);

    const tipos = mockNotificationRepo.create.mock.calls.map(([n]) => n.type);
    expect(tipos).not.toContain('SCHEDULE_OVERDUE');
  });

  it('inspetor que saiu do prédio: marca, mas não avisa', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockResolvedValue([
      makeSchedule({
        inspector_id: INSPECTOR_B,
        inspector: { id: INSPECTOR_B, name: 'Bruno', email: 'b@t.com', status: 'ACTIVE' },
      }),
    ]);
    mockScheduleRepo.claimDueSoon.mockResolvedValue(true);

    const res = await scheduleJobService.runDaily(agora);

    expect(mockScheduleRepo.claimDueSoon).toHaveBeenCalled();
    expect(res.due_soon).toBe(0);
    expect(mockNotificationRepo.create).not.toHaveBeenCalled();
  });

  it('falha do banco não derruba o ciclo', async () => {
    mockScheduleRepo.listDueSoonCandidates.mockRejectedValue(new Error('banco'));
    expect(await scheduleJobService.runDaily(agora)).toEqual({ due_soon: 0 });
  });
});

// ── Sino ──────────────────────────────────────────────────────────────────────
describe('notificationService', () => {
  const usuario = { id: INSPECTOR_A, kind: 'USER', role: 'NONE' } as any;

  it('lista as do usuário com a contagem de não lidas', async () => {
    mockNotificationRepo.listForUser.mockResolvedValue([{ id: 'n1' }] as any);
    mockNotificationRepo.countUnread.mockResolvedValue(3);

    expect(await notificationService.list(usuario, 30)).toEqual({ notifications: [{ id: 'n1' }], unread: 3 });
    expect(mockNotificationRepo.listForUser).toHaveBeenCalledWith(INSPECTOR_A, 30, undefined);
  });

  it('com building_id, lista e contagem são daquele prédio', async () => {
    mockNotificationRepo.listForUser.mockResolvedValue([]);
    mockNotificationRepo.countUnread.mockResolvedValue(1);

    await notificationService.list(usuario, 10, BUILDING_ID);
    expect(mockNotificationRepo.listForUser).toHaveBeenCalledWith(INSPECTOR_A, 10, BUILDING_ID);
    expect(mockNotificationRepo.countUnread).toHaveBeenCalledWith(INSPECTOR_A, BUILDING_ID);
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
  it('conta a agenda pelo dia agendado e ordena a cobertura por andar', async () => {
    const hoje = zonedDayKey(new Date());
    mockAnalyticsRepo.porInspetor.mockResolvedValue([
      { id: INSPECTOR_A, name: 'Ana', vistorias: 4, dias: 3, andares_distintos: 2, ocorrencias: 5 },
      // Tem histórico no período, mas não é mais INSPECTOR ativo do prédio: some da lista.
      { id: 'inspetor-que-saiu', name: 'Caio', vistorias: 9, dias: 5, andares_distintos: 3, ocorrencias: 1 },
    ] as any);
    mockScheduleRepo.listForPeriod.mockResolvedValue([
      // Futura: pendente em dia.
      {
        status: 'PENDENTE',
        scheduled_date: d('2099-01-01'),
        due_date: d('2099-01-05'),
        completed_at: null,
        building_id: BUILDING_ID,
        inspector_id: INSPECTOR_A,
      },
      // Dia agendado no passado, prazo no futuro: atrasada, dentro do limite.
      // O inspetor saiu do prédio: conta também em `without_inspector`.
      {
        status: 'PENDENTE',
        scheduled_date: d('2000-01-01'),
        due_date: d('2099-01-01'),
        completed_at: null,
        building_id: BUILDING_ID,
        inspector_id: 'inspetor-que-saiu',
      },
      // Dia agendado e prazo no passado: atrasada e passada do limite.
      {
        status: 'PENDENTE',
        scheduled_date: d('2000-01-01'),
        due_date: d('2000-01-02'),
        completed_at: null,
        building_id: BUILDING_ID,
        inspector_id: INSPECTOR_A,
      },
      // Feita no dia agendado: em dia.
      {
        status: 'CONCLUIDO',
        scheduled_date: d('2030-05-10'),
        due_date: d('2030-05-12'),
        completed_at: new Date('2030-05-10T15:00:00Z'),
      },
      // Feita depois do dia agendado, ainda dentro do prazo: atrasada.
      {
        status: 'CONCLUIDO',
        scheduled_date: d('2030-05-10'),
        due_date: d('2030-05-12'),
        completed_at: new Date('2030-05-11T15:00:00Z'),
      },
      { status: 'CANCELADO', scheduled_date: d('2030-05-10'), due_date: d('2030-05-12'), completed_at: null },
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
    expect(res.schedules).toEqual({
      pending: 1,
      overdue: 2,
      past_deadline: 1,
      done_on_time: 1,
      done_late: 1,
      canceled: 1,
      without_inspector: 1,
    });
    expect(res.tickets).toEqual({ by_status: { ABERTO: 2, CONCLUIDO: 1 } });
    expect(res.coverage.map((x) => x.label)).toEqual(['6º Andar', 'Térreo', '1º Subsolo']);
    expect(res.coverage[0].days_since).toBe(0);
    expect(res.coverage[2]).toEqual({
      floor_id: 'sub',
      label: '1º Subsolo',
      last_inspected_at: null,
      days_since: null,
    });
    expect(mockScheduleRepo.listForPeriod).toHaveBeenCalledWith(BUILDING_ID, d('2030-05-01'), d('2030-05-31'));
  });
});

describe('faixas de data da agenda', () => {
  const valido = {
    inspector_id: INSPECTOR_A,
    scheduled_date: '2030-05-10',
    due_date: '2030-05-12',
    floor_ids: [FLOOR_6],
  };

  it('aceita só anos entre 2000 e 2100', () => {
    expect(createScheduleSchema.safeParse({ ...valido, scheduled_date: '2000-01-01' }).success).toBe(true);
    expect(createScheduleSchema.safeParse({ ...valido, due_date: '2100-12-31' }).success).toBe(true);
    expect(createScheduleSchema.safeParse({ ...valido, scheduled_date: '1999-12-31' }).success).toBe(false);
    expect(createScheduleSchema.safeParse({ ...valido, due_date: '2101-01-01' }).success).toBe(false);
    expect(updateScheduleSchema.safeParse({ due_date: '9999-01-01' }).success).toBe(false);
  });

  it('overview: fim antes do início e período acima de 366 dias são recusados', () => {
    expect(overviewQuerySchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(true); // 366
    expect(overviewQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-01' }).success).toBe(true); // 366
    expect(overviewQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02' }).success).toBe(false); // 367
    expect(overviewQuerySchema.safeParse({ from: '2026-05-10', to: '2026-05-09' }).success).toBe(false);
  });

  it('overview com uma data só: o período resultante também respeita os 366 dias', async () => {
    await expect(supervisorOverview(BUILDING_ID, { from: '2000-01-01' })).rejects.toBeInstanceOf(ValidationError);
  });
});
