import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const buildingRepository = {
  findById(id: string) {
    return prisma.building.findUnique({ where: { id } });
  },

  getMemberBuildings(userId: string) {
    return prisma.buildingMember.findMany({
      where: { user_id: userId },
      include: { building: true },
    });
  },

  findAll(createdBy?: string) {
    return prisma.building.findMany({
      where: createdBy ? { created_by: createdBy } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  create(data: { name: string; description?: string; created_by: string }) {
    return prisma.building.create({ data });
  },

  update(id: string, data: { name?: string; description?: string }) {
    return prisma.building.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.building.delete({ where: { id } });
  },

  getFloors(buildingId: string) {
    return prisma.floor.findMany({
      where: { building_id: buildingId },
      orderBy: { order: 'asc' },
    });
  },

  createFloor(data: { building_id: string; label: string }) {
    return prisma.floor.create({ data });
  },

  deleteFloor(id: string) {
    return prisma.floor.delete({ where: { id } });
  },

  findFloorsByIds(ids: string[]) {
    return prisma.floor.findMany({ where: { id: { in: ids } } });
  },

  // ── Membros ────────────────────────────────────────────────────────────────
  findMember(buildingId: string, userId: string) {
    return prisma.buildingMember.findUnique({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  getMembers(buildingId: string) {
    return prisma.buildingMember.findMany({
      where: { building_id: buildingId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
  },

  addMember(buildingId: string, userId: string, role: string) {
    return prisma.buildingMember.create({
      data: { building_id: buildingId, user_id: userId, role },
    });
  },

  removeMemberSelf(buildingId: string, userId: string) {
    return prisma.buildingMember.delete({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  removeMember(buildingId: string, userId: string) {
    return prisma.buildingMember.delete({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  // ── Solicitações de acesso ─────────────────────────────────────────────────
  findAccessRequest(buildingId: string, userId: string) {
    return prisma.buildingAccessRequest.findUnique({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  getAccessRequests(buildingId: string, status?: string) {
    return prisma.buildingAccessRequest.findMany({
      where: { building_id: buildingId, ...(status ? { status } : {}) },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { requested_at: 'desc' },
    });
  },

  createAccessRequest(buildingId: string, userId: string) {
    return prisma.buildingAccessRequest.create({
      data: { building_id: buildingId, user_id: userId },
    });
  },

  updateAccessRequest(id: string, status: string) {
    return prisma.buildingAccessRequest.update({
      where: { id },
      data: { status, reviewed_at: new Date() },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
  },

  getDashboard(buildingId: string) {
    return Promise.all([
      prisma.buildingMember.count({ where: { building_id: buildingId, role: 'INSPECTOR' } }),
      prisma.buildingMember.count({ where: { building_id: buildingId, role: 'VIEWER' } }),
      prisma.inspectionReport.count({ where: { building_id: buildingId } }),
    ]);
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
    const { user_id, metadata, ...rest } = data;
    return prisma.auditLog
      .create({
        data: {
          ...rest,
          metadata: metadata as Prisma.InputJsonValue | undefined,
          ...(user_id ? { user: { connect: { id: user_id } } } : {}),
        },
      })
      .catch((err) => {
        // Nunca deixar falha de audit derrubar a operação principal
        console.error('[AuditLog] Falha ao registrar:', err);
      });
  },
};
