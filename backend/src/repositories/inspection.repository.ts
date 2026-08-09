import {
  FloorStatus,
  InspectionStatus,
  MaintenanceCategory,
  MaintenanceType,
  Prisma,
  Priority,
  RecordStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

const reportInclude = {
  inspector: { select: { id: true, name: true, email: true, role: true } },
  building: true,
  floor_form_entries: {
    include: {
      floor: true,
      maintenance_records: true,
    },
  },
} satisfies Prisma.InspectionReportInclude;

export type FloorSubmission = {
  floor_id: string;
  status_geral: FloorStatus;
  records: Array<{
    maintenance_type: MaintenanceType;
    category: MaintenanceCategory;
    priority: Priority;
    description: string;
    responsible: string;
    status: RecordStatus;
  }>;
};

export const inspectionRepository = {
  /**
   * Grava a vistoria inteira de uma vez: relatório já COMPLETED, andares e ocorrências.
   * Tudo em uma transação — ou entra completo, ou não entra nada.
   */
  createCompleted(data: {
    inspector_id: string;
    building_id: string;
    date: Date;
    started_at: Date;
    finished_at: Date;
    floors: FloorSubmission[];
  }) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.inspectionReport.create({
        data: {
          inspector_id: data.inspector_id,
          building_id: data.building_id,
          date: data.date,
          started_at: data.started_at,
          finished_at: data.finished_at,
          floors_inspected: data.floors.map((f) => f.floor_id),
          status: InspectionStatus.COMPLETED,
        },
      });

      for (const floor of data.floors) {
        const entry = await tx.floorFormEntry.create({
          data: {
            report_id: report.id,
            floor_id: floor.floor_id,
            status_geral: floor.status_geral,
          },
        });

        if (floor.records.length > 0) {
          await tx.maintenanceRecord.createMany({
            data: floor.records.map((record) => ({
              floor_form_entry_id: entry.id,
              ...record,
            })),
          });
        }
      }

      return tx.inspectionReport.findUniqueOrThrow({
        where: { id: report.id },
        include: reportInclude,
      });
    });
  },

  findById(id: string) {
    return prisma.inspectionReport.findUnique({ where: { id }, include: reportInclude });
  },

  findAll(filters: {
    page: number;
    limit: number;
    status?: InspectionStatus;
    inspector_id?: string;
    floor_id?: string;
    building_id?: string;
    /** Restringe aos prédios visíveis ao usuário. `null`/ausente = sem restrição (ADMIN). */
    building_ids?: string[] | null;
    date_from?: string;
    date_to?: string;
  }) {
    const { page, limit, status, inspector_id, floor_id, building_id, building_ids, date_from, date_to } =
      filters;
    const skip = (page - 1) * limit;

    // Filtro pedido e escopo de visibilidade se somam (AND) — pedir um prédio
    // específico nunca amplia o que o usuário pode ver.
    const buildingScope: Prisma.InspectionReportWhereInput[] = [];
    if (building_id) buildingScope.push({ building_id });
    if (building_ids) buildingScope.push({ building_id: { in: building_ids } });

    const where: Prisma.InspectionReportWhereInput = {
      status: status ?? InspectionStatus.COMPLETED,
      ...(inspector_id && { inspector_id }),
      ...(buildingScope.length ? { AND: buildingScope } : {}),
      ...(floor_id && { floors_inspected: { has: floor_id } }),
      ...(date_from || date_to
        ? {
            date: {
              ...(date_from && { gte: new Date(date_from) }),
              ...(date_to && { lte: new Date(date_to) }),
            },
          }
        : {}),
    };

    return Promise.all([
      prisma.inspectionReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { finished_at: 'desc' },
        include: {
          inspector: { select: { id: true, name: true, email: true } },
          building: { select: { id: true, name: true } },
          floor_form_entries: {
            select: {
              floor_id: true,
              status_geral: true,
              floor: { select: { label: true } },
              _count: { select: { maintenance_records: true } },
            },
          },
        },
      }),
      prisma.inspectionReport.count({ where }),
    ]);
  },

  update(id: string, data: Prisma.InspectionReportUpdateInput) {
    return prisma.inspectionReport.update({ where: { id }, data });
  },

  /** Apaga o relatório; entradas de andar e ocorrências saem em cascata. */
  delete(id: string) {
    return prisma.inspectionReport.delete({ where: { id } });
  },

  getCalendarData(
    dateFrom: Date,
    dateTo: Date,
    buildingId?: string,
    buildingIds?: string[] | null
  ) {
    const buildingScope: Prisma.InspectionReportWhereInput[] = [];
    if (buildingId) buildingScope.push({ building_id: buildingId });
    if (buildingIds) buildingScope.push({ building_id: { in: buildingIds } });

    return prisma.inspectionReport.findMany({
      where: {
        status: InspectionStatus.COMPLETED,
        finished_at: { gte: dateFrom, lte: dateTo },
        ...(buildingScope.length ? { AND: buildingScope } : {}),
      },
      select: {
        id: true,
        finished_at: true,
        excel_url: true,
        inspector: { select: { id: true, name: true } },
      },
    });
  },
};
