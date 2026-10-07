import { BuildingRole, InspectionStatus, Prisma, RecordStatus, ScheduleStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * O agendamento como toda tela o lê: prédio, inspetor, andares e quem marcou.
 *
 * O e-mail e o status do inspetor vêm junto porque quem avisa precisa dos dois;
 * eles não saem na resposta (ver `serializeSchedule`). O dono do prédio vem
 * pelo mesmo motivo: é na conta dele que o e-mail do aviso conta.
 */
export const SCHEDULE_INCLUDE = {
  building: { select: { id: true, name: true, owner_manager_id: true } },
  inspector: { select: { id: true, name: true, email: true, status: true } },
  floors: { include: { floor: { select: { id: true, label: true } } } },
  created_by_manager: { select: { name: true } },
  created_by_user: { select: { name: true } },
} satisfies Prisma.InspectionScheduleInclude;

export type ScheduleRow = Prisma.InspectionScheduleGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

export type ScheduleFilter = {
  building_id?: string;
  /** Recorte por vários prédios — a agenda do inspetor. `undefined` é sem recorte. */
  building_ids?: string[];
  inspector_id?: string;
  statuses?: ScheduleStatus[];
  /** Intervalo de dias: entra o agendamento cujo período [início, prazo] o toca. */
  from?: Date;
  to?: Date;
  /** Só o que foi agendado antes deste dia — a lista de atrasados. */
  scheduled_before?: Date;
};

export type ScheduleWrite = {
  inspector_id?: string;
  scheduled_date?: Date;
  due_date?: Date;
  notes?: string | null;
  status?: ScheduleStatus;
  completed_at?: Date | null;
  completed_report_id?: string | null;
  created_by_manager_id?: string | null;
  created_by_user_id?: string | null;
  updated_by_manager_id?: string | null;
  updated_by_user_id?: string | null;
  due_soon_notified_at?: Date | null;
};

function toWhere(filter: ScheduleFilter): Prisma.InspectionScheduleWhereInput {
  return {
    ...(filter.building_id && { building_id: filter.building_id }),
    ...(filter.building_ids && { building_id: { in: filter.building_ids } }),
    ...(filter.inspector_id && { inspector_id: filter.inspector_id }),
    ...(filter.statuses && { status: { in: filter.statuses } }),
    // Sobreposição de intervalos: começa antes do fim do recorte e termina
    // depois do início dele. A ronda de 28/09 a 03/10 aparece em setembro e em
    // outubro — é nos dois meses que ela ocupa a agenda de alguém.
    ...((filter.to || filter.scheduled_before) && {
      scheduled_date: {
        ...(filter.to && { lte: filter.to }),
        ...(filter.scheduled_before && { lt: filter.scheduled_before }),
      },
    }),
    ...(filter.from && { due_date: { gte: filter.from } }),
  };
}

export const scheduleRepository = {
  findById(id: string) {
    return prisma.inspectionSchedule.findUnique({ where: { id }, include: SCHEDULE_INCLUDE });
  },

  /** `take` é o teto de segurança das listas sem recorte de mês. */
  list(filter: ScheduleFilter, take?: number) {
    return prisma.inspectionSchedule.findMany({
      where: toWhere(filter),
      include: SCHEDULE_INCLUDE,
      orderBy: [{ scheduled_date: 'asc' }, { due_date: 'asc' }, { created_at: 'asc' }],
      ...(take !== undefined && { take }),
    });
  },

  create(data: ScheduleWrite & { building_id: string; inspector_id: string }, floorIds: string[]) {
    return prisma.inspectionSchedule.create({
      data: {
        ...(data as Prisma.InspectionScheduleUncheckedCreateInput),
        floors: { create: floorIds.map((floor_id) => ({ floor_id })) },
      },
      include: SCHEDULE_INCLUDE,
    });
  },

  /**
   * Grava a mudança só se a ronda ainda está como foi lida (concorrência
   * otimista): o `WHERE` leva o status e o `updated_at` da leitura. Devolve
   * `null` quando outra escrita chegou antes — quem chama responde 409.
   *
   * Com `floorIds`, os andares são trocados pelo conjunto novo na mesma
   * transação da gravação.
   */
  updateIfUnchanged(
    id: string,
    expected: { status: ScheduleStatus; updated_at: Date },
    data: ScheduleWrite,
    floorIds?: string[]
  ) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.inspectionSchedule.updateMany({
        where: { id, status: expected.status, updated_at: expected.updated_at },
        data: data as Prisma.InspectionScheduleUncheckedUpdateManyInput,
      });
      if (count === 0) return null;
      if (floorIds) {
        await tx.inspectionScheduleFloor.deleteMany({ where: { schedule_id: id } });
        await tx.inspectionScheduleFloor.createMany({
          data: floorIds.map((floor_id) => ({ schedule_id: id, floor_id })),
        });
      }
      return tx.inspectionSchedule.findUnique({ where: { id }, include: SCHEDULE_INCLUDE });
    });
  },

  /**
   * Os inspetores do prédio que ainda podem receber ronda: vínculo de
   * INSPECTOR e conta ativa.
   */
  async listInspectors(buildingId: string) {
    const rows = await prisma.buildingMember.findMany({
      where: { building_id: buildingId, role: BuildingRole.INSPECTOR, user: { status: 'ACTIVE' } },
      select: { user: { select: { id: true, name: true } } },
    });
    return rows.map((r) => r.user);
  },

  /**
   * Os pares (prédio, inspetor) que continuam valendo, dentre os pedidos.
   *
   * Uma consulta só para a lista inteira: o ciclo diário pergunta isso para
   * cada lembrete, e uma ida ao banco por linha cresceria com a base.
   */
  async activeInspectorPairs(pedidos: Array<{ building_id: string; user_id: string }>) {
    const pairs = [...new Map(pedidos.map((p) => [`${p.building_id}:${p.user_id}`, p])).values()];
    if (pairs.length === 0) return new Set<string>();
    const rows = await prisma.buildingMember.findMany({
      where: {
        role: BuildingRole.INSPECTOR,
        user: { status: 'ACTIVE' },
        OR: pairs.map((p) => ({ building_id: p.building_id, user_id: p.user_id })),
      },
      select: { building_id: true, user_id: true },
    });
    return new Set(rows.map((r) => `${r.building_id}:${r.user_id}`));
  },

  /** Quantas rondas PENDENTE cada inspetor tem no prédio, tocando o período (se houver). */
  async countPendingByInspector(
    buildingId: string,
    inspectorIds: string[],
    from?: Date,
    to?: Date
  ): Promise<Map<string, number>> {
    if (inspectorIds.length === 0) return new Map();
    const rows = await prisma.inspectionSchedule.groupBy({
      by: ['inspector_id'],
      where: {
        ...toWhere({ building_id: buildingId, statuses: [ScheduleStatus.PENDENTE], from, to }),
        inspector_id: { in: inspectorIds },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.inspector_id as string, r._count._all]));
  },

  /**
   * A última vistoria de cada inspetor que passou por algum daqueles andares.
   * Sem andares, a última vistoria dele no prédio.
   */
  async lastInspectionByInspector(
    buildingId: string,
    inspectorIds: string[],
    floorIds: string[]
  ): Promise<Map<string, Date>> {
    if (inspectorIds.length === 0) return new Map();
    const rows = await prisma.inspectionReport.groupBy({
      by: ['inspector_id'],
      where: {
        building_id: buildingId,
        inspector_id: { in: inspectorIds },
        status: InspectionStatus.COMPLETED,
        origin: 'VISTORIA',
        ...(floorIds.length > 0 && { floors_inspected: { hasSome: floorIds } }),
      },
      _max: { date: true },
    });
    const map = new Map<string, Date>();
    for (const r of rows) {
      if (r.inspector_id && r._max.date) map.set(r.inspector_id, r._max.date);
    }
    return map;
  },

  /** As rondas que a vistoria enviada pode ter cumprido. */
  findPendingForCompletion(inspectorId: string, buildingId: string, date: Date) {
    return prisma.inspectionSchedule.findMany({
      where: {
        inspector_id: inspectorId,
        building_id: buildingId,
        status: ScheduleStatus.PENDENTE,
        scheduled_date: { lte: date },
      },
      select: { id: true, scheduled_date: true, floors: { select: { floor_id: true } } },
    });
  },

  /**
   * As vistorias concluídas do inspetor no prédio, de `from` até `to` (dias
   * inclusive) — o que soma para cobrir os andares de uma ronda. Só data e
   * andares: a conta é feita em memória, só para as rondas candidatas.
   */
  listReportsForCoverage(inspectorId: string, buildingId: string, from: Date, to: Date) {
    return prisma.inspectionReport.findMany({
      where: {
        inspector_id: inspectorId,
        building_id: buildingId,
        status: InspectionStatus.COMPLETED,
        origin: 'VISTORIA',
        date: { gte: from, lte: to },
      },
      select: { id: true, date: true, floors_inspected: true },
    });
  },

  /**
   * Dá as rondas por cumpridas e devolve os ids que de fato mudaram. O filtro
   * por PENDENTE fica no próprio UPDATE: a ronda cancelada entre a leitura e a
   * escrita não volta à vida, e não entra na auditoria.
   */
  async markCompleted(ids: string[], reportId: string, at: Date): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.inspectionSchedule.updateManyAndReturn({
      where: { id: { in: ids }, status: ScheduleStatus.PENDENTE },
      data: { status: ScheduleStatus.CONCLUIDO, completed_at: at, completed_report_id: reportId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /**
   * Pendentes com prazo de hoje a amanhã que ainda não receberam o lembrete.
   *
   * Hoje entra junto: o dia em que o ciclo não rodou, e a ronda criada depois
   * do ciclo com prazo para amanhã, ainda são avisados no dia do prazo.
   */
  listDueSoonCandidates(today: Date, tomorrow: Date) {
    return prisma.inspectionSchedule.findMany({
      where: {
        status: ScheduleStatus.PENDENTE,
        due_date: { gte: today, lte: tomorrow },
        due_soon_notified_at: null,
      },
      include: SCHEDULE_INCLUDE,
    });
  },

  /**
   * Reserva o lembrete antes de mandá-lo. Devolve `true` só para quem marcou —
   * duas execuções do ciclo ao mesmo tempo não avisam duas vezes.
   */
  async claimDueSoon(id: string, at: Date) {
    const res = await prisma.inspectionSchedule.updateMany({
      where: { id, status: ScheduleStatus.PENDENTE, due_soon_notified_at: null },
      data: { due_soon_notified_at: at },
    });
    return res.count === 1;
  },

  /**
   * Status e datas das rondas agendadas no período — a contagem do supervisor.
   * É o dia agendado que diz se a ronda atrasou, e por isso é ele que recorta.
   */
  listForPeriod(buildingId: string, from: Date, to: Date) {
    return prisma.inspectionSchedule.findMany({
      where: { building_id: buildingId, scheduled_date: { gte: from, lte: to } },
      select: {
        status: true,
        scheduled_date: true,
        due_date: true,
        completed_at: true,
        building_id: true,
        inspector_id: true,
      },
    });
  },

  /** Chamados do prédio nascidos no período, contados pelo status de agora. */
  async ticketsByStatus(buildingId: string, from: Date, to: Date) {
    const rows = await prisma.maintenanceRecord.groupBy({
      by: ['status'],
      where: {
        created_at: { gte: from, lte: to },
        floor_form_entry: { report: { building_id: buildingId } },
      },
      _count: { _all: true },
    });
    const porStatus = Object.fromEntries(
      Object.values(RecordStatus).map((s) => [s, 0])
    ) as Record<RecordStatus, number>;
    for (const r of rows) porStatus[r.status] = r._count._all;
    return porStatus;
  },

  /**
   * Cada andar do prédio e o dia da última vistoria que passou por ele.
   *
   * LEFT JOIN de propósito: o andar que nunca foi vistoriado é justamente o que
   * o supervisor precisa ver, e um JOIN comum o tiraria da lista.
   */
  coverage(buildingId: string) {
    return prisma.$queryRaw<Array<{ floor_id: string; label: string; last_day: string | null }>>`
      SELECT f.id AS floor_id, f.label, MAX(r.date)::text AS last_day
      FROM floors f
      LEFT JOIN floor_form_entries ffe ON ffe.floor_id = f.id
      LEFT JOIN inspection_reports r
        ON r.id = ffe.report_id
       AND r.status = 'COMPLETED'::"InspectionStatus"
       AND r.origin = 'VISTORIA'::"ReportOrigin"
      WHERE f.building_id = ${buildingId}
      GROUP BY f.id, f.label
    `;
  },
};
