import { AuditAction, InspectionStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generateShareKey } from '../utils/shareKey';
import { sortFloorsDesc } from '../utils/floorOrder';

// Campos seguros para expor a quem nao e admin (nunca inclui share_key).
const PUBLIC_BUILDING_FIELDS = { id: true, name: true, description: true } as const;

export const buildingRepository = {
  findById(id: string) {
    return prisma.building.findUnique({ where: { id } });
  },

  findByShareKey(shareKey: string) {
    return prisma.building.findUnique({ where: { share_key: shareKey } });
  },

  getMemberBuildings(userId: string) {
    return prisma.buildingMember.findMany({
      where: { user_id: userId },
      include: { building: { select: PUBLIC_BUILDING_FIELDS } },
    });
  },

  findAll(createdBy?: string) {
    return prisma.building.findMany({
      where: createdBy ? { created_by: createdBy } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  /** Cria o predio com uma chave de compartilhamento aleatoria, tentando de novo em caso de colisao. */
  async create(data: { name: string; description?: string; created_by: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.building.create({
          data: { ...data, share_key: generateShareKey() },
        });
      } catch (err) {
        const isDuplicateKey =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target ?? '').includes('share_key');
        if (!isDuplicateKey) throw err;
      }
    }
    throw new Error('Não foi possível gerar uma chave de compartilhamento única');
  },

  update(id: string, data: { name?: string; description?: string }) {
    return prisma.building.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.building.delete({ where: { id } });
  },

  /** Andares sempre do mais alto para o mais baixo — ordem em que a vistoria acontece. */
  async getFloors(buildingId: string) {
    const floors = await prisma.floor.findMany({ where: { building_id: buildingId } });
    return sortFloorsDesc(floors);
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
      // Só conta inspeções concluídas — as IN_PROGRESS ainda não viraram relatório
      prisma.inspectionReport.count({
        where: { building_id: buildingId, status: InspectionStatus.COMPLETED },
      }),
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
