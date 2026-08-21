import { AuditAction, BuildingRole, InspectionStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generateShareKey } from '../utils/shareKey';
import { sortFloorsDesc } from '../utils/floorOrder';
import { logger } from '../lib/logger';

// Campos seguros para expor a quem nao e gestor (nunca inclui share_key).
const PUBLIC_BUILDING_FIELDS = { id: true, name: true, description: true } as const;

// Serve para usuario e para gestor: as duas tabelas tem as mesmas colunas de
// identificacao, e a tela de colaboradores mostra os dois lado a lado.
const ACCOUNT_FIELDS = {
  id: true,
  name: true,
  email: true,
  avatar_url: true,
} as const;

export const buildingRepository = {
  findById(id: string) {
    return prisma.building.findUnique({ where: { id } });
  },

  findByShareKey(shareKey: string) {
    return prisma.building.findUnique({ where: { share_key: shareKey } });
  },

  // ── Gestores ───────────────────────────────────────────────────────────────
  /** O vínculo de gestão, que é o que autoriza tudo que altera o prédio. */
  findManagerLink(buildingId: string, managerId: string) {
    return prisma.buildingManager.findUnique({
      where: { building_id_manager_id: { building_id: buildingId, manager_id: managerId } },
    });
  },

  async getManagedBuildingIds(managerId: string): Promise<string[]> {
    const rows = await prisma.buildingManager.findMany({
      where: { manager_id: managerId },
      select: { building_id: true },
    });
    return rows.map((row) => row.building_id);
  },

  /** Gestores do prédio, para a tela de colaboradores. */
  getManagers(buildingId: string) {
    return prisma.buildingManager.findMany({
      where: { building_id: buildingId },
      include: { manager: { select: ACCOUNT_FIELDS } },
      orderBy: { joined_at: 'asc' },
    });
  },

  /** Quantos gestores o prédio tem — usado para nunca deixá-lo sem nenhum. */
  countManagers(buildingId: string) {
    return prisma.buildingManager.count({ where: { building_id: buildingId } });
  },

  addManager(buildingId: string, managerId: string) {
    return prisma.buildingManager.create({
      data: { building_id: buildingId, manager_id: managerId },
      include: { manager: { select: ACCOUNT_FIELDS } },
    });
  },

  removeManager(buildingId: string, managerId: string) {
    return prisma.buildingManager.delete({
      where: { building_id_manager_id: { building_id: buildingId, manager_id: managerId } },
    });
  },

  /**
   * Prédios em que o gestor é o único.
   *
   * Consultado antes de desfazer a gestão ou apagar a conta: prédio sem gestor
   * não tem quem aprove solicitação, promova inspetor ou cadastre andar — só
   * sobra o ADMIN, que é suporte e não dono.
   */
  async findBuildingsWhereSoleManager(managerId: string) {
    const managed = await prisma.buildingManager.findMany({
      where: { manager_id: managerId },
      include: { building: { select: { id: true, name: true } } },
    });
    if (managed.length === 0) return [];

    const counts = await prisma.buildingManager.groupBy({
      by: ['building_id'],
      where: { building_id: { in: managed.map((m) => m.building_id) } },
      _count: { _all: true },
    });

    const soleIds = new Set(
      counts.filter((c) => c._count._all <= 1).map((c) => c.building_id)
    );
    return managed.filter((m) => soleIds.has(m.building_id)).map((m) => m.building);
  },

  // ── Membros (usuarios comuns) ──────────────────────────────────────────────
  /** Ids dos prédios em que o usuário tem vínculo — usado para filtrar listagens. */
  async getMemberBuildingIds(userId: string): Promise<string[]> {
    const rows = await prisma.buildingMember.findMany({
      where: { user_id: userId },
      select: { building_id: true },
    });
    return rows.map((row) => row.building_id);
  },

  /**
   * Vínculos do usuário no formato que o app lê: id do prédio, nome e papel.
   *
   * É o que o frontend usa para saber o que a pessoa pode fazer em cada prédio.
   */
  async getUserMemberships(userId: string) {
    const rows = await prisma.buildingMember.findMany({
      where: { user_id: userId },
      include: { building: { select: PUBLIC_BUILDING_FIELDS } },
      orderBy: { joined_at: 'asc' },
    });

    return rows.map((row) => ({
      building_id: row.building_id,
      name: row.building.name,
      description: row.building.description,
      role: row.role,
      joined_at: row.joined_at,
    }));
  },

  /**
   * Papel de várias contas de uma vez, para a lista do admin.
   * Uma consulta só: uma por usuário estoura conforme a base cresce.
   */
  async getMembershipsByUserIds(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, BuildingRole[]>();

    const rows = await prisma.buildingMember.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, role: true },
    });

    const byUser = new Map<string, BuildingRole[]>();
    for (const row of rows) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role);
      byUser.set(row.user_id, list);
    }
    return byUser;
  },

  /**
   * Os responsáveis do prédio — o droplist do formulário de vistoria e o de
   * encaminhamento do moderador saem daqui.
   *
   * Conta desativada fica de fora: encaminhar chamado a quem não entra mais no
   * sistema é o mesmo que não encaminhar.
   */
  async getResponsibles(buildingId: string) {
    const rows = await prisma.buildingMember.findMany({
      where: {
        building_id: buildingId,
        role: BuildingRole.RESPONSAVEL,
        user: { status: 'ACTIVE' },
      },
      include: { user: { select: ACCOUNT_FIELDS } },
    });

    return rows.map((row) => row.user).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  /** Aquela conta é responsável neste prédio? Devolve a conta, ou nulo. */
  async findResponsible(buildingId: string, userId: string) {
    const row = await prisma.buildingMember.findUnique({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
      include: { user: { select: ACCOUNT_FIELDS } },
    });

    return row?.role === BuildingRole.RESPONSAVEL ? row.user : null;
  },

  findMember(buildingId: string, userId: string) {
    return prisma.buildingMember.findUnique({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
    });
  },

  /** Colaboradores do prédio — só usuários; os gestores saem de `getManagers`. */
  getMembers(buildingId: string) {
    return prisma.buildingMember.findMany({
      where: { building_id: buildingId },
      include: { user: { select: ACCOUNT_FIELDS } },
      orderBy: [{ role: 'asc' }, { joined_at: 'asc' }],
    });
  },

  /**
   * Vincula o usuário ao prédio.
   *
   * Quem entra por solicitação entra como VIEWER; promover a INSPECTOR é decisão
   * do gestor, na tela de colaboradores. Não existe promover a gestor por aqui:
   * gestor é outro tipo de conta.
   */
  addMember(buildingId: string, userId: string, role: BuildingRole = BuildingRole.VIEWER) {
    return prisma.buildingMember.create({
      data: { building_id: buildingId, user_id: userId, role },
      include: { user: { select: ACCOUNT_FIELDS } },
    });
  },

  updateMemberRole(buildingId: string, userId: string, role: BuildingRole) {
    return prisma.buildingMember.update({
      where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
      data: { role },
      include: { user: { select: ACCOUNT_FIELDS } },
    });
  },

  /**
   * Desfaz o vínculo do usuário com o prédio.
   *
   * A solicitação aprovada sai junto: sem o vínculo ela não representa mais nada
   * e, se ficasse, bloquearia um pedido futuro para o mesmo prédio.
   */
  removeMember(buildingId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.buildingMember.delete({
        where: { building_id_user_id: { building_id: buildingId, user_id: userId } },
      });

      await tx.buildingAccessRequest.deleteMany({
        where: { building_id: buildingId, user_id: userId },
      });

      return member;
    });
  },

  // ── Predios ────────────────────────────────────────────────────────────────
  /** Todos os prédios (ADMIN) ou só os que aquele gestor administra. */
  findAll(managedBy?: string) {
    return prisma.building.findMany({
      where: managedBy ? { managers: { some: { manager_id: managedBy } } } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Cria o prédio e registra o gestor, numa transação só.
   *
   * Os dois passos são um só fato: prédio que existe sem gestor não tem quem o
   * administre. `created_by` é gravado como histórico de quem cadastrou.
   *
   * A chave de compartilhamento é aleatória, e a colisão é rara o bastante para
   * ser tratada tentando de novo.
   */
  async create(data: { name: string; description?: string; created_by: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const building = await tx.building.create({
            data: { ...data, share_key: generateShareKey() },
          });

          await tx.buildingManager.create({
            data: { building_id: building.id, manager_id: data.created_by },
          });

          return building;
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
      include: { user: { select: ACCOUNT_FIELDS } },
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
      include: { user: { select: ACCOUNT_FIELDS } },
    });
  },

  /**
   * Números do sistema inteiro, para o painel do ADMIN.
   *
   * Gestor agora é uma conta, e não um papel: a contagem sai da tabela própria.
   * Inspetor e visualizador continuam vindo do vínculo, contando conta distinta
   * — a mesma pessoa pode vistoriar um prédio e acompanhar outro.
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
      prisma.manager.count({ where: { status: 'ACTIVE' } }),
      countDistinctMembers(BuildingRole.INSPECTOR),
      countDistinctMembers(BuildingRole.VIEWER),
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
      prisma.buildingMember.count({
        where: { building_id: buildingId, role: BuildingRole.INSPECTOR },
      }),
      prisma.buildingMember.count({
        where: { building_id: buildingId, role: BuildingRole.VIEWER },
      }),
      // Só conta inspeções concluídas — as IN_PROGRESS ainda não viraram relatório
      prisma.inspectionReport.count({
        where: { building_id: buildingId, status: InspectionStatus.COMPLETED },
      }),
    ]);
  },
};

/** Contas de usuário distintas que ocupam um papel em pelo menos um prédio. */
async function countDistinctMembers(role: BuildingRole): Promise<number> {
  const rows = await prisma.buildingMember.groupBy({ by: ['user_id'], where: { role } });
  return rows.length;
}

export const auditRepository = {
  /**
   * Registra a ação.
   *
   * `user_id` e `manager_id` são excludentes: quem agiu é uma conta de usuário
   * ou uma de gestor, e elas vivem em tabelas diferentes.
   */
  log(data: {
    user_id?: string;
    manager_id?: string;
    building_id?: string;
    action: AuditAction;
    entity?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  }) {
    const { user_id, manager_id, building_id, metadata, ...rest } = data;
    return prisma.auditLog
      .create({
        data: {
          ...rest,
          metadata: metadata as Prisma.InputJsonValue | undefined,
          ...(user_id ? { user: { connect: { id: user_id } } } : {}),
          ...(manager_id ? { manager: { connect: { id: manager_id } } } : {}),
          // O prédio dá ao gestor uma trilha só do que é dele — sem isto o
          // histórico é do sistema inteiro ou de ninguém.
          ...(building_id ? { building: { connect: { id: building_id } } } : {}),
        },
      })
      .catch((err) => {
        // Nunca deixar falha de audit derrubar a operação principal
        logger.error({ err }, '[AuditLog] Falha ao registrar');
      });
  },
};

/** Monta os campos de autoria do log a partir de quem fez a requisição. */
export function actorAudit(actor: { id: string; kind: string }) {
  return actor.kind === 'MANAGER' ? { manager_id: actor.id } : { user_id: actor.id };
}
