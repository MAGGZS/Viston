import { AuditAction, InspectionStatus, Prisma, Role } from '@prisma/client';
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

  /** Ids dos prédios em que o usuário é membro — usado para filtrar listagens. */
  async getMemberBuildingIds(userId: string): Promise<string[]> {
    const rows = await prisma.buildingMember.findMany({
      where: { user_id: userId },
      select: { building_id: true },
    });
    return rows.map((row) => row.building_id);
  },

  findAll(createdBy?: string) {
    return prisma.building.findMany({
      where: createdBy ? { created_by: createdBy } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  /** Ids dos prédios criados pelo gestor — usado para filtrar listagens. */
  async getManagedBuildingIds(userId: string): Promise<string[]> {
    const rows = await prisma.building.findMany({
      where: { created_by: userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
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
      include: { user: { select: { id: true, name: true, email: true, role: true, avatar_url: true } } },
    });
  },

  /**
   * Vincula o usuário ao prédio.
   *
   * Quem entra num prédio entra como VIEWER, e o papel global acompanha —
   * quem promove para INSPECTOR depois é o gestor, pela tela de colaboradores.
   */
  addMember(buildingId: string, userId: string, role: Role = Role.VIEWER) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.buildingMember.create({
        data: { building_id: buildingId, user_id: userId, role },
        include: { user: { select: { id: true, name: true, email: true, role: true, avatar_url: true } } },
      });

      if (member.user.role !== Role.INSPECTOR && member.user.role !== Role.VIEWER) {
        return member;
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, name: true, email: true, role: true, avatar_url: true },
      });

      return { ...member, user };
    });
  },

  /**
   * Troca o nível de acesso do membro.
   *
   * O papel do vínculo e o papel global do usuário andam juntos: o resto do
   * sistema (rotas, guardas de tela) lê `users.role`, e é o gestor do prédio
   * quem decide se a pessoa vistoria ou só acompanha.
   */
  updateMemberRole(buildingId: string, userId: string, role: Role) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.buildingMember.update({
        where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
        data: { role },
        include: { user: { select: { id: true, name: true, email: true, role: true, avatar_url: true } } },
      });

      // ADMIN e GESTOR nunca são rebaixados por um vínculo: eles podem integrar
      // o prédio de outra pessoa sem perder o que são no sistema.
      if (member.user.role !== Role.INSPECTOR && member.user.role !== Role.VIEWER) {
        return member;
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, name: true, email: true, role: true, avatar_url: true },
      });

      return { ...member, user };
    });
  },

  removeMemberSelf(buildingId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.buildingMember.delete({
        where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
      });

      // Sem o vínculo, a solicitação aprovada não representa mais nada — e, se
      // ficasse, bloquearia um pedido futuro para o mesmo prédio.
      await tx.buildingAccessRequest.deleteMany({
        where: { building_id: buildingId, user_id: userId },
      });

      return member;
    });
  },

  // ── Solicitações de acesso ─────────────────────────────────────────────────
  findAccessRequest(buildingId: string, userId: string) {
    return prisma.buildingAccessRequest.findUnique({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  findAccessRequestById(id: string) {
    return prisma.buildingAccessRequest.findUnique({ where: { id } });
  },

  getAccessRequests(buildingId: string, status?: string) {
    return prisma.buildingAccessRequest.findMany({
      where: { building_id: buildingId, ...(status ? { status } : {}) },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatar_url: true } } },
      orderBy: { requested_at: 'desc' },
    });
  },

  /**
   * Abre a solicitação de acesso do usuário ao prédio.
   *
   * Upsert porque o par prédio/usuário é único: uma solicitação já resolvida
   * (recusada, ou aprovada de um vínculo que não existe mais) é reaberta em vez
   * de barrar o novo pedido.
   */
  createAccessRequest(buildingId: string, userId: string) {
    return prisma.buildingAccessRequest.upsert({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
      create: { building_id: buildingId, user_id: userId },
      update: { status: 'PENDING', requested_at: new Date(), reviewed_at: null },
    });
  },

  updateAccessRequest(id: string, status: string) {
    return prisma.buildingAccessRequest.update({
      where: { id },
      data: { status, reviewed_at: new Date() },
      include: { user: { select: { id: true, name: true, email: true, role: true, avatar_url: true } } },
    });
  },

  /**
   * Números do sistema inteiro, para o painel do ADMIN.
   *
   * A média de andares sai de uma agregação só: contar andar por prédio no Node
   * custaria uma consulta por prédio conforme a base cresce.
   */
  async getSystemStats() {
    const [
      buildings,
      floors,
      managers,
      inspectors,
      viewers,
      activeUsers,
      completedInspections,
      pendingRequests,
      biggest,
    ] = await Promise.all([
      prisma.building.count(),
      prisma.floor.count(),
      prisma.user.count({ where: { role: Role.GESTOR, status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: Role.INSPECTOR, status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: Role.VIEWER, status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.inspectionReport.count({ where: { status: InspectionStatus.COMPLETED } }),
      prisma.buildingAccessRequest.count({ where: { status: 'PENDING' } }),
      prisma.floor.groupBy({
        by: ['building_id'],
        _count: { _all: true },
        orderBy: { _count: { building_id: 'desc' } },
        take: 5,
      }),
    ]);

    const topBuildings = biggest.length
      ? await prisma.building.findMany({
          where: { id: { in: biggest.map((row) => row.building_id) } },
          select: { id: true, name: true },
        })
      : [];

    return {
      buildings,
      floors,
      // Uma casa decimal já diz o que a média tem a dizer
      averageFloors: buildings ? Math.round((floors / buildings) * 10) / 10 : 0,
      managers,
      inspectors,
      viewers,
      activeUsers,
      completedInspections,
      pendingRequests,
      topBuildings: biggest.map((row) => ({
        id: row.building_id,
        name: topBuildings.find((b) => b.id === row.building_id)?.name ?? 'Prédio removido',
        floors: row._count._all,
      })),
    };
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
