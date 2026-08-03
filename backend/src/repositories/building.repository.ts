import { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const buildingRepository = {
  findById(id: string) {
    return prisma.building.findUnique({ where: { id } });
  },

  getFloors(buildingId: string) {
    return prisma.floor.findMany({
      where: { building_id: buildingId },
      orderBy: { order: 'desc' },
    });
  },

  findFloorsByIds(ids: string[]) {
    return prisma.floor.findMany({ where: { id: { in: ids } } });
  },
};

export const auditRepository = {
  log(data: {
    user_id?: string;
    action: AuditAction;
    entity?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.auditLog.create({ data }).catch((err) => {
      // Nunca deixar falha de audit derrubar a operação principal
      console.error('[AuditLog] Falha ao registrar:', err);
    });
  },
};
