import { Prisma, RecordStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Tudo que a tela de chamado mostra sobre uma ocorrência.
 *
 * O prédio não é coluna daqui: a ocorrência pertence a um andar, o andar a uma
 * vistoria, e a vistoria a um prédio. Por isso toda consulta desce por
 * `floor_form_entry.report` — e é de lá que sai também a data e quem vistoriou,
 * que é o contexto sem o qual a descrição não quer dizer nada.
 */
const ticketInclude = {
  responsible_user: { select: { id: true, name: true, email: true, avatar_url: true } },
  closed_by: { select: { id: true, name: true } },
  floor_form_entry: {
    select: {
      id: true,
      status_geral: true,
      floor: { select: { id: true, label: true } },
      report: {
        select: {
          id: true,
          date: true,
          building_id: true,
          building: { select: { id: true, name: true } },
          inspector: { select: { id: true, name: true, avatar_url: true } },
        },
      },
    },
  },
} satisfies Prisma.MaintenanceRecordInclude;

export type TicketRow = Prisma.MaintenanceRecordGetPayload<{ include: typeof ticketInclude }>;

/** Filtro "as ocorrências deste prédio", escrito uma vez só. */
function inBuilding(buildingId: string): Prisma.MaintenanceRecordWhereInput {
  return { floor_form_entry: { report: { building_id: buildingId } } };
}

export const ticketRepository = {
  findById(id: string) {
    return prisma.maintenanceRecord.findUnique({ where: { id }, include: ticketInclude });
  },

  /**
   * Os chamados do prédio num dos estados da tela, do mais novo para o mais
   * velho — a mesma leitura do histórico, só que ocorrência por ocorrência.
   */
  findByBuilding(filters: {
    building_id: string;
    statuses: RecordStatus[];
    page: number;
    limit: number;
  }) {
    const where: Prisma.MaintenanceRecordWhereInput = {
      ...inBuilding(filters.building_id),
      status: { in: filters.statuses },
    };

    return Promise.all([
      prisma.maintenanceRecord.findMany({
        where,
        include: ticketInclude,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.maintenanceRecord.count({ where }),
    ]);
  },

  /**
   * Os chamados encaminhados a uma pessoa, em todos os prédios dela.
   *
   * O responsável não escolhe prédio: ele abre o app e vê o que é dele. Os já
   * fechados ficam de fora — quem fechou foi o moderador, e a lista dele é de
   * trabalho, não de arquivo.
   */
  findByResponsible(responsibleId: string, includeClosed = false) {
    return prisma.maintenanceRecord.findMany({
      where: {
        responsible_id: responsibleId,
        status: includeClosed
          ? { not: RecordStatus.ABERTO }
          : { in: [RecordStatus.EM_ANDAMENTO, RecordStatus.AGUARDANDO_TERCEIRO, RecordStatus.AGUARDANDO_FECHAMENTO] },
      },
      include: ticketInclude,
      orderBy: { created_at: 'desc' },
    });
  },

  /** Quantos chamados em cada estado — os contadores do painel do moderador. */
  async countByStatus(buildingId: string): Promise<Record<RecordStatus, number>> {
    const rows = await prisma.maintenanceRecord.groupBy({
      by: ['status'],
      where: inBuilding(buildingId),
      _count: { _all: true },
    });

    const zeroed = {
      ABERTO: 0,
      EM_ANDAMENTO: 0,
      AGUARDANDO_TERCEIRO: 0,
      AGUARDANDO_FECHAMENTO: 0,
      CONCLUIDO: 0,
    } as Record<RecordStatus, number>;

    for (const row of rows) zeroed[row.status] = row._count._all;
    return zeroed;
  },

  update(id: string, data: Prisma.MaintenanceRecordUncheckedUpdateInput) {
    return prisma.maintenanceRecord.update({ where: { id }, data, include: ticketInclude });
  },
};
