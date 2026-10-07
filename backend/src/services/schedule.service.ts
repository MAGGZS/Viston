import { AuditAction, BuildingRole, ScheduleStatus } from '@prisma/client';
import { scheduleRepository, ScheduleRow, ScheduleWrite } from '../repositories/schedule.repository';
import { buildingRepository, auditRepository, actorAudit } from '../repositories/building.repository';
import { notificationService } from './notification.service';
import { Actor } from '../middlewares/authenticate';
import { visibleBuildingIds } from '../middlewares/buildingAccess';
import {
  CreateSchedulePayload,
  ScheduleListQuery,
  SuggestionQuery,
  UpdateSchedulePayload,
} from '../validators/schedule.validator';
import { ConflictError, NotFoundError, ScheduleChangedError, ValidationError } from '../utils/errors';
import { sortFloorsDesc } from '../utils/floorOrder';
import { zonedDayKey, zonedParts } from '../utils/timezone';
import { logger } from '../lib/logger';

/** `yyyy-MM-dd` para o `Date` que a coluna DATE espera (meia-noite UTC). */
export const toDateOnly = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
/** O caminho de volta: coluna DATE para `yyyy-MM-dd`. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Hoje, no calendário do produto — é contra este dia que "atrasado" se mede. */
export const todayKey = (now = new Date()) => zonedDayKey(now);

/**
 * O agendamento no formato do contrato com o app.
 *
 * Os três sinais de atraso são calculados aqui, e não gravados — dependem do
 * dia de hoje, e um status gravado envelheceria sozinho à meia-noite:
 *
 * - `overdue`: PENDENTE e o dia agendado já passou. O atraso conta dali.
 * - `past_deadline`: PENDENTE e o prazo (`due_date`, o limite final) passou.
 * - `completed_late`: CONCLUIDO num dia depois do agendado. O dia é o de
 *   `completed_at` no fuso do produto — na conclusão pela vistoria, é o dia
 *   do envio.
 *
 * O inspetor cuja conta foi apagada (o vínculo é SetNull) sai como "Usuário
 * removido", a mesma convenção do histórico de vistorias.
 *
 * `inspector_left`: o inspetor não é mais INSPECTOR com conta ativa deste
 * prédio (saiu, mudou de papel, foi suspenso ou apagado). A ronda continua
 * existindo, "sem inspetor", para o gestor ou o VIEWER redistribuir. `ativos`
 * são os pares `prédio:inspetor` ainda válidos, carregados em lote por quem
 * chama (ver `inspetoresAtivos`); sem ele, vale o status da conta na linha.
 */
export function serializeSchedule(s: ScheduleRow, today = todayKey(), ativos?: Set<string>) {
  const due = dayKey(s.due_date);
  const scheduled = dayKey(s.scheduled_date);
  const pendente = s.status === ScheduleStatus.PENDENTE;
  return {
    id: s.id,
    building_id: s.building_id,
    building_name: s.building.name,
    inspector: s.inspector
      ? { id: s.inspector.id, name: s.inspector.name }
      : { id: null, name: 'Usuário removido' },
    scheduled_date: scheduled,
    due_date: due,
    notes: s.notes,
    status: s.status,
    inspector_left: ativos
      ? !s.inspector_id || !ativos.has(`${s.building_id}:${s.inspector_id}`)
      : !s.inspector || s.inspector.status !== 'ACTIVE',
    overdue: pendente && scheduled < today,
    past_deadline: pendente && due < today,
    completed_late: isCompletedLate(s),
    floors: sortFloorsDesc(s.floors.map((f) => f.floor)).map((f) => ({ id: f.id, label: f.label })),
    completed_at: s.completed_at,
    completed_report_id: s.completed_report_id,
    created_by: s.created_by_manager
      ? { name: s.created_by_manager.name, kind: 'MANAGER' as const }
      : s.created_by_user
        ? { name: s.created_by_user.name, kind: 'USER' as const }
        : null,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

/** Concluída num dia depois do agendado (no fuso do produto). */
export function isCompletedLate(s: { status: ScheduleStatus; scheduled_date: Date; completed_at: Date | null }) {
  return (
    s.status === ScheduleStatus.CONCLUIDO &&
    s.completed_at !== null &&
    zonedDayKey(s.completed_at) > dayKey(s.scheduled_date)
  );
}

/** O recorte de dias de `?month=&year=`. Sem nenhum dos dois, sem recorte. */
export function monthRange(query: { month?: number; year?: number }): { from?: Date; to?: Date } {
  if (!query.month && !query.year) return {};
  const year = query.year ?? zonedParts().year;
  if (!query.month) {
    return { from: toDateOnly(`${year}-01-01`), to: toDateOnly(`${year}-12-31`) };
  }
  const mm = String(query.month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, query.month, 0)).getUTCDate();
  return { from: toDateOnly(`${year}-${mm}-01`), to: toDateOnly(`${year}-${mm}-${lastDay}`) };
}

/** Quem escreveu, nas duas colunas do papel — uma de gestor, uma de usuário. */
function autoria(actor: Actor, papel: 'created' | 'updated'): ScheduleWrite {
  const gestor = actor.kind === 'MANAGER' ? actor.id : null;
  const usuario = actor.kind === 'MANAGER' ? null : actor.id;
  return papel === 'created'
    ? { created_by_manager_id: gestor, created_by_user_id: usuario }
    : { updated_by_manager_id: gestor, updated_by_user_id: usuario };
}

/**
 * O inspetor escolhido tem de ser INSPECTOR deste prédio, com a conta ativa.
 *
 * A consulta é a mesma da sugestão e do ciclo diário (vínculo INSPECTOR e conta
 * ACTIVE): a conta suspensa não recebe ronda nova, nem por troca de inspetor.
 */
async function assertInspectorOf(buildingId: string, inspectorId: string) {
  const ativos = await scheduleRepository.activeInspectorPairs([{ building_id: buildingId, user_id: inspectorId }]);
  if (!ativos.has(`${buildingId}:${inspectorId}`)) {
    throw new ValidationError('O inspetor escolhido não é inspetor ativo deste prédio');
  }
}

/**
 * Os pares `prédio:inspetor` ainda válidos (INSPECTOR com conta ACTIVE) dentre
 * as rondas pedidas. Uma consulta só para a lista inteira, sem repetir par.
 */
export async function inspetoresAtivos(
  rows: Array<{ building_id: string; inspector_id: string | null }>
): Promise<Set<string>> {
  const pares = new Map<string, { building_id: string; user_id: string }>();
  for (const r of rows) {
    if (r.inspector_id) {
      pares.set(`${r.building_id}:${r.inspector_id}`, { building_id: r.building_id, user_id: r.inspector_id });
    }
  }
  if (pares.size === 0) return new Set();
  return scheduleRepository.activeInspectorPairs([...pares.values()]);
}

/** Teto de segurança das listas sem recorte de mês. */
export const LISTA_SEM_RECORTE_MAX = 500;

/** Os andares existem, são deste prédio, e saem sem repetição. */
async function resolveFloors(buildingId: string, floorIds: string[]): Promise<string[]> {
  const unicos = [...new Set(floorIds)];
  if (unicos.length === 0) throw new ValidationError('Escolha ao menos um andar');

  const floors = await buildingRepository.findFloorsByIds(unicos);
  if (floors.length !== unicos.length || floors.some((f) => f.building_id !== buildingId)) {
    throw new ValidationError('Um ou mais andares não pertencem a este prédio');
  }
  return unicos;
}

/**
 * A pessoa ainda é inspetora do prédio? Quem saiu do prédio não recebe aviso
 * dele — nem o de cancelamento.
 */
async function stillInspector(buildingId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const member = await buildingRepository.findMember(buildingId, userId);
  return member?.role === BuildingRole.INSPECTOR;
}

/**
 * O e-mail sai sem segurar a resposta. A promessa nunca rejeita (ver
 * `notificationService.notifySchedule`), mas o `catch` fica de cinto.
 */
function avisar(
  type: Parameters<typeof notificationService.notifySchedule>[0],
  schedule: ScheduleRow,
  destinatario: ScheduleRow['inspector']
) {
  return notificationService
    .notifySchedule(type, schedule, destinatario)
    .then(({ email }) => {
      void email;
    })
    .catch((err) => logger.error({ err, schedule_id: schedule.id }, '[Agenda] Falha ao avisar'));
}

/** Transições de status aceitas. Concluído e cancelado só voltam para pendente. */
const TRANSICOES: Record<ScheduleStatus, ScheduleStatus[]> = {
  PENDENTE: [ScheduleStatus.CONCLUIDO, ScheduleStatus.CANCELADO],
  CONCLUIDO: [ScheduleStatus.PENDENTE],
  CANCELADO: [ScheduleStatus.PENDENTE],
};

export const scheduleService = {
  /**
   * A agenda do prédio.
   *
   * Todo vínculo vê a agenda inteira do prédio — o INSPECTOR também, só para
   * leitura (a escrita é de gestor e VIEWER, na rota). As rondas só dele estão
   * em `/me/schedules`.
   *
   * `status` filtra por um status. Sem mês e sem ano (e em `overdue`), a lista
   * não tem recorte de datas, e sai com no máximo `LISTA_SEM_RECORTE_MAX`.
   *
   * `overdue` troca o recorte: os atrasados de qualquer mês, do mais antigo
   * para o mais novo — o atraso não respeita a virada do mês.
   */
  async list(buildingId: string, query: Omit<ScheduleListQuery, 'overdue'> & { overdue?: boolean }) {
    const today = todayKey();
    const recorte = monthRange(query);
    const semRecorte = query.overdue || (!recorte.from && !recorte.to);

    const rows = query.overdue
      ? await scheduleRepository.list(
          {
            building_id: buildingId,
            statuses: [ScheduleStatus.PENDENTE],
            scheduled_before: toDateOnly(today),
          },
          LISTA_SEM_RECORTE_MAX
        )
      : await scheduleRepository.list(
          {
            building_id: buildingId,
            ...(query.status && { statuses: [query.status] }),
            ...recorte,
          },
          semRecorte ? LISTA_SEM_RECORTE_MAX : undefined
        );
    const ativos = await inspetoresAtivos(rows);
    return { schedules: rows.map((r) => serializeSchedule(r, today, ativos)) };
  },

  /**
   * A agenda de quem pede, em todos os prédios que ele enxerga.
   *
   * Só PENDENTE e CONCLUIDO: a ronda cancelada não é trabalho de ninguém, e o
   * aviso de cancelamento já foi para o sino.
   *
   * Com `building_id`, só aquele prédio — cada prédio tem a sua agenda. Prédio
   * fora dos visíveis devolve lista vazia, como as outras listagens.
   *
   * `status` (PENDENTE ou CONCLUIDO) filtra por um só. Sem mês e sem ano, sai
   * com no máximo `LISTA_SEM_RECORTE_MAX`.
   */
  async mine(
    actor: Actor,
    query: { month?: number; year?: number; building_id?: string; status?: 'PENDENTE' | 'CONCLUIDO' }
  ) {
    if (actor.kind !== 'USER') return { schedules: [] };

    const visiveis = await visibleBuildingIds(actor);
    const buildingIds = query.building_id
      ? visiveis && !visiveis.includes(query.building_id)
        ? []
        : [query.building_id]
      : visiveis;
    if (buildingIds && buildingIds.length === 0) return { schedules: [] };

    const { from, to } = monthRange(query);
    const rows = await scheduleRepository.list(
      {
        inspector_id: actor.id,
        ...(buildingIds && { building_ids: buildingIds }),
        statuses: query.status ? [query.status] : [ScheduleStatus.PENDENTE, ScheduleStatus.CONCLUIDO],
        from,
        to,
      },
      !from && !to ? LISTA_SEM_RECORTE_MAX : undefined
    );
    const today = todayKey();
    const ativos = await inspetoresAtivos(rows);
    return { schedules: rows.map((r) => serializeSchedule(r, today, ativos)) };
  },

  async create(buildingId: string, actor: Actor, body: CreateSchedulePayload) {
    const [floorIds] = await Promise.all([
      resolveFloors(buildingId, body.floor_ids),
      assertInspectorOf(buildingId, body.inspector_id),
    ]);

    const schedule = await scheduleRepository.create(
      {
        building_id: buildingId,
        inspector_id: body.inspector_id,
        scheduled_date: toDateOnly(body.scheduled_date),
        due_date: toDateOnly(body.due_date),
        notes: body.notes?.trim() || null,
        ...autoria(actor, 'created'),
        ...autoria(actor, 'updated'),
      },
      floorIds
    );

    await auditRepository.log({
      ...actorAudit(actor),
      building_id: buildingId,
      action: AuditAction.SCHEDULE_CREATED,
      entity: 'InspectionSchedule',
      entity_id: schedule.id,
      metadata: {
        inspector_id: body.inspector_id,
        scheduled_date: body.scheduled_date,
        due_date: body.due_date,
        floors: floorIds.length,
      },
    });

    await avisar('SCHEDULE_CREATED', schedule, schedule.inspector);

    // O inspetor acabou de ser conferido como ativo (`assertInspectorOf`).
    return { schedule: serializeSchedule(schedule, todayKey(), new Set([`${buildingId}:${body.inspector_id}`])) };
  },

  /**
   * Muda a ronda: campos, status, ou os dois.
   *
   * Só a ronda PENDENTE tem campos editáveis — mudar o andar de uma ronda já
   * feita reescreveria o que aconteceu. Para mexer numa concluída ou cancelada,
   * ela volta para PENDENTE primeiro (na mesma chamada, se quiser).
   */
  async update(buildingId: string, scheduleId: string, actor: Actor, body: UpdateSchedulePayload) {
    const atual = await scheduleRepository.findById(scheduleId);
    if (!atual || atual.building_id !== buildingId) throw new NotFoundError('Agendamento');

    const novoStatus = body.status ?? atual.status;
    if (body.status && body.status !== atual.status && !TRANSICOES[atual.status].includes(body.status)) {
      throw new ConflictError('Mudança de status não permitida para este agendamento');
    }

    const mexeCampos =
      body.inspector_id !== undefined ||
      body.scheduled_date !== undefined ||
      body.due_date !== undefined ||
      body.floor_ids !== undefined ||
      body.notes !== undefined;
    if (mexeCampos && novoStatus !== ScheduleStatus.PENDENTE) {
      throw new ConflictError('Só um agendamento pendente pode ser alterado');
    }

    const inicio = body.scheduled_date ?? dayKey(atual.scheduled_date);
    const prazo = body.due_date ?? dayKey(atual.due_date);
    if (prazo < inicio) throw new ValidationError('O prazo não pode ser antes da data agendada');

    const trocaInspetor = body.inspector_id !== undefined && body.inspector_id !== atual.inspector_id;
    const [floorIds] = await Promise.all([
      body.floor_ids ? resolveFloors(buildingId, body.floor_ids) : Promise.resolve(undefined),
      trocaInspetor ? assertInspectorOf(buildingId, body.inspector_id as string) : Promise.resolve(),
    ]);

    const andaresAntes = atual.floors.map((f) => f.floor_id).sort();
    const mudouAndares =
      floorIds !== undefined &&
      (floorIds.length !== andaresAntes.length || [...floorIds].sort().some((id, i) => id !== andaresAntes[i]));
    const mudouInicio = inicio !== dayKey(atual.scheduled_date);
    const mudouPrazo = prazo !== dayKey(atual.due_date);
    const mudouStatus = novoStatus !== atual.status;
    const reaberto = mudouStatus && novoStatus === ScheduleStatus.PENDENTE;

    const data: ScheduleWrite = { ...autoria(actor, 'updated') };
    if (trocaInspetor) data.inspector_id = body.inspector_id;
    if (mudouInicio) data.scheduled_date = toDateOnly(inicio);
    if (mudouPrazo) data.due_date = toDateOnly(prazo);
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (mudouStatus) data.status = novoStatus;

    if (mudouStatus && novoStatus === ScheduleStatus.CONCLUIDO) {
      // Concluída à mão: não há vistoria por trás, então o relatório fica nulo.
      data.completed_at = new Date();
      data.completed_report_id = null;
    }
    // Reaberta ou cancelada, a ronda não está concluída: nada de carimbo de
    // conclusão sobrando de antes.
    if (reaberto || (mudouStatus && novoStatus === ScheduleStatus.CANCELADO)) {
      data.completed_at = null;
      data.completed_report_id = null;
    }
    // Prazo novo é lembrete novo: sem zerar, quem já foi avisado do prazo
    // antigo não seria avisado do novo.
    if (mudouPrazo || reaberto) data.due_soon_notified_at = null;

    // Concorrência otimista: grava só se ninguém mexeu na ronda desde a leitura.
    // Sem gravação, sem auditoria e sem aviso.
    const schedule = await scheduleRepository.updateIfUnchanged(
      scheduleId,
      { status: atual.status, updated_at: atual.updated_at },
      data,
      mudouAndares ? floorIds : undefined
    );
    if (!schedule) throw new ScheduleChangedError();

    const cancelou = mudouStatus && novoStatus === ScheduleStatus.CANCELADO;
    await auditRepository.log({
      ...actorAudit(actor),
      building_id: buildingId,
      action: cancelou ? AuditAction.SCHEDULE_CANCELED : AuditAction.SCHEDULE_UPDATED,
      entity: 'InspectionSchedule',
      entity_id: scheduleId,
      metadata: {
        ...(mudouStatus && { status: { de: atual.status, para: novoStatus } }),
        ...(trocaInspetor && { inspector_id: { de: atual.inspector_id, para: body.inspector_id } }),
        ...(mudouInicio && { scheduled_date: inicio }),
        ...(mudouPrazo && { due_date: prazo }),
        ...(mudouAndares && { floors: floorIds?.length }),
        ...(body.notes !== undefined && { notes: true }),
      },
    });

    // ── Avisos ────────────────────────────────────────────────────────────────
    if (cancelou) {
      if (await stillInspector(buildingId, atual.inspector_id)) {
        await avisar('SCHEDULE_CANCELED', schedule, atual.inspector);
      }
    } else if (novoStatus === ScheduleStatus.PENDENTE) {
      if (trocaInspetor) {
        // Para o antigo, a ronda saiu da agenda; para o novo, entrou. A ronda
        // reaberta que estava cancelada não estava na agenda de ninguém.
        if (atual.status === ScheduleStatus.PENDENTE && (await stillInspector(buildingId, atual.inspector_id))) {
          await avisar('SCHEDULE_CANCELED', schedule, atual.inspector);
        }
        await avisar('SCHEDULE_CREATED', schedule, schedule.inspector);
      } else if (reaberto && atual.status === ScheduleStatus.CANCELADO) {
        await avisar('SCHEDULE_CREATED', schedule, schedule.inspector);
      } else if (mudouInicio || mudouPrazo || mudouAndares || reaberto) {
        await avisar('SCHEDULE_UPDATED', schedule, schedule.inspector);
      }
    }

    const ativos = await inspetoresAtivos([schedule]);
    return { schedule: serializeSchedule(schedule, todayKey(), ativos) };
  },

  /**
   * Quem deveria pegar esta ronda.
   *
   * Primeiro o menos ocupado: menos rondas PENDENTE tocando o mesmo período (o
   * período inteiro, se ele não vier). No empate, quem passou por aqueles
   * andares há mais tempo — e quem nunca passou vem antes de todos, porque é
   * quem mais tem a ganhar olhando o andar. No último empate, o nome, para a
   * ordem ser estável entre duas chamadas iguais.
   *
   * A contagem é deste prédio: a agenda de outro prédio não é da conta de quem
   * gere este.
   */
  async suggestion(buildingId: string, query: SuggestionQuery) {
    const inspetores = await scheduleRepository.listInspectors(buildingId);
    const ids = inspetores.map((i) => i.id);

    const [pendentes, ultimas] = await Promise.all([
      scheduleRepository.countPendingByInspector(
        buildingId,
        ids,
        query.scheduled_date ? toDateOnly(query.scheduled_date) : undefined,
        query.due_date ? toDateOnly(query.due_date) : undefined
      ),
      scheduleRepository.lastInspectionByInspector(buildingId, ids, query.floor_ids),
    ]);

    const linhas = inspetores.map((i) => {
      const ultima = ultimas.get(i.id);
      return {
        id: i.id,
        name: i.name,
        pending_count: pendentes.get(i.id) ?? 0,
        last_inspected_at: ultima ? dayKey(ultima) : null,
      };
    });

    linhas.sort((a, b) => {
      if (a.pending_count !== b.pending_count) return a.pending_count - b.pending_count;
      if (a.last_inspected_at !== b.last_inspected_at) {
        if (a.last_inspected_at === null) return -1;
        if (b.last_inspected_at === null) return 1;
        return a.last_inspected_at < b.last_inspected_at ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return { inspectors: linhas.map((l, i) => ({ ...l, suggested: i === 0 })) };
  },

  /**
   * As vistorias enviadas cumprem as rondas que cobriram, somadas.
   *
   * Cumpre a ronda PENDENTE do mesmo inspetor, no mesmo prédio, que já tinha
   * começado no dia da vistoria, quando a união dos andares de todas as
   * vistorias concluídas dele ali, do dia agendado até hoje, cobre todos os
   * andares da ronda. A ronda de 3 andares feita em duas idas fecha na segunda,
   * e `completed_report_id` fica com a vistoria que completou a cobertura.
   * Atrasada ou passada do prazo, fecha do mesmo jeito: o atraso fica em
   * `completed_late`, pelo dia do envio desta última vistoria.
   *
   * O custo fica preso às candidatas: só as rondas pendentes deste inspetor
   * neste prédio, e só as vistorias dele ali desde a mais antiga delas.
   *
   * Inspetor que não é mais INSPECTOR ativo do prédio (`inspector_left`) não
   * fecha ronda nenhuma: ela espera ser redistribuída.
   *
   * Quem chama não pode quebrar por causa disto (ver `inspectionService.submit`).
   */
  async completeFromReport(report: {
    id: string;
    inspector_id: string | null;
    building_id: string;
    date: Date;
    floors_inspected: string[];
  }) {
    if (!report.inspector_id) return 0;
    const inspectorId = report.inspector_id;

    const candidatas = await scheduleRepository.findPendingForCompletion(
      inspectorId,
      report.building_id,
      report.date
    );
    const comAndares = candidatas.filter((c) => c.floors.length > 0);
    if (comAndares.length === 0) return 0;

    const ativos = await inspetoresAtivos([{ building_id: report.building_id, inspector_id: inspectorId }]);
    if (!ativos.has(`${report.building_id}:${inspectorId}`)) return 0;

    const desde = new Date(Math.min(...comAndares.map((c) => c.scheduled_date.getTime())));
    const vistorias = await scheduleRepository.listReportsForCoverage(
      inspectorId,
      report.building_id,
      desde,
      report.date
    );

    const cumpridas = comAndares
      .filter((c) => {
        // A vistoria desta chamada entra sempre, mesmo que a leitura não a veja.
        const vistos = new Set(report.floors_inspected);
        for (const v of vistorias) {
          if (v.date.getTime() >= c.scheduled_date.getTime()) {
            for (const f of v.floors_inspected) vistos.add(f);
          }
        }
        return c.floors.every((f) => vistos.has(f.floor_id));
      })
      .map((c) => c.id);

    if (cumpridas.length === 0) return 0;

    // Só os ids que o UPDATE mudou de fato vão para a auditoria: a ronda
    // cancelada entre a leitura e a escrita não foi concluída.
    const concluidas = await scheduleRepository.markCompleted(cumpridas, report.id, new Date());

    await auditRepository.logMany(
      concluidas.map((id) => ({
        user_id: inspectorId,
        building_id: report.building_id,
        action: AuditAction.SCHEDULE_UPDATED,
        entity: 'InspectionSchedule',
        entity_id: id,
        metadata: { status: { de: 'PENDENTE', para: 'CONCLUIDO' }, report_id: report.id, automatico: true },
      }))
    );

    return concluidas.length;
  },
};
