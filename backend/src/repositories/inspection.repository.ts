import { InspectionStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const reportInclude = {
  inspector: { select: { id: true, name: true, email: true, role: true } },
  building: true,
  floor_form_entries: {
    include: {
      floor: true,
      form_item_responses: true,
    },
  },
} satisfies Prisma.InspectionReportInclude;

export const inspectionRepository = {
  create(data: {
    inspector_id: string;
    building_id: string;
    date: Date;
    floors_inspected: string[];
  }) {
    return prisma.inspectionReport.create({ data, include: reportInclude });
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
    google_form_synced?: boolean;
    date_from?: string;
    date_to?: string;
  }) {
    const { page, limit, status, inspector_id, floor_id, google_form_synced, date_from, date_to } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.InspectionReportWhereInput = {
      // Por padrão, só COMPLETED aparece no histórico
      status: status ?? InspectionStatus.COMPLETED,
      ...(inspector_id && { inspector_id }),
      ...(google_form_synced !== undefined && { google_form_synced }),
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
          floor_form_entries: { select: { floor_id: true, status_geral: true } },
        },
      }),
      prisma.inspectionReport.count({ where }),
    ]);
  },

  update(id: string, data: Prisma.InspectionReportUpdateInput) {
    return prisma.inspectionReport.update({ where: { id }, data });
  },

  upsertFloorEntry(data: {
    report_id: string;
    floor_id: string;
    status_geral: 'OK' | 'ATENCAO' | 'PROBLEMA';
    observations: string[];
    photos: string[];
    items: Array<{
      category: 'MANUTENCAO' | 'LIMPEZA';
      item_name: string;
      has_item?: boolean;
      quantity?: number;
      is_marked?: boolean;
      status?: 'OK' | 'NOK' | 'NA';
    }>;
  }) {
    return prisma.$transaction(async (tx) => {
      // Upsert do FloorFormEntry
      const existing = await tx.floorFormEntry.findUnique({
        where: { report_id_floor_id: { report_id: data.report_id, floor_id: data.floor_id } },
      });

      let entry;
      if (existing) {
        // Deletar respostas antigas e recriar
        await tx.formItemResponse.deleteMany({ where: { floor_form_entry_id: existing.id } });
        entry = await tx.floorFormEntry.update({
          where: { id: existing.id },
          data: {
            status_geral: data.status_geral,
            observations: data.observations,
            photos: data.photos,
            completed_at: new Date(),
          },
        });
      } else {
        entry = await tx.floorFormEntry.create({
          data: {
            report_id: data.report_id,
            floor_id: data.floor_id,
            status_geral: data.status_geral,
            observations: data.observations,
            photos: data.photos,
          },
        });
      }

      await tx.formItemResponse.createMany({
        data: data.items.map((item) => ({
          floor_form_entry_id: entry.id,
          category: item.category,
          item_name: item.item_name,
          has_item: item.has_item ?? null,
          quantity: item.quantity ?? null,
          is_marked: item.is_marked ?? null,
          status: item.status ?? null,
        })),
      });

      return entry;
    });
  },

  countCompletedFloors(reportId: string) {
    return prisma.floorFormEntry.count({ where: { report_id: reportId } });
  },

  getCalendarData(dateFrom: Date, dateTo: Date) {
    return prisma.inspectionReport.findMany({
      where: {
        status: InspectionStatus.COMPLETED,
        finished_at: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        finished_at: true,
        inspector: { select: { id: true, name: true } },
      },
    });
  },
};
