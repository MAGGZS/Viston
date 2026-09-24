import { prisma } from '../lib/prisma';

/** Os quatro estados do pedido. Texto, como em `building_access_requests`. */
export const TRANSFER_STATUS = {
  PENDENTE: 'PENDENTE',
  ACEITO: 'ACEITO',
  RECUSADO: 'RECUSADO',
  EXPIRADO: 'EXPIRADO',
} as const;

/** Sete dias. É o prazo do comprometimento — ver o comentário do serviço. */
export const PRAZO_TRANSFERENCIA_DIAS = 7;

const COM_PESSOAS = {
  building: { select: { id: true, name: true } },
  from_manager: { select: { id: true, name: true, email: true } },
  to_manager: { select: { id: true, name: true, email: true } },
} as const;

export const ownershipRepository = {
  /** O pedido de pé deste prédio, se houver. Só existe um por vez. */
  findPendingByBuilding(buildingId: string) {
    return prisma.buildingOwnershipTransfer.findFirst({
      where: { building_id: buildingId, status: TRANSFER_STATUS.PENDENTE },
      include: COM_PESSOAS,
    });
  },

  findById(id: string) {
    return prisma.buildingOwnershipTransfer.findUnique({
      where: { id },
      include: COM_PESSOAS,
    });
  },

  create(data: { building_id: string; from_manager_id: string; to_manager_id: string; expires_at: Date }) {
    return prisma.buildingOwnershipTransfer.create({ data, include: COM_PESSOAS });
  },

  /** O que espera resposta desta conta — a tela do co-gestor indicado. */
  listPendingFor(managerId: string) {
    return prisma.buildingOwnershipTransfer.findMany({
      where: { to_manager_id: managerId, status: TRANSFER_STATUS.PENDENTE },
      include: COM_PESSOAS,
      orderBy: { requested_at: 'desc' },
    });
  },

  /** O histórico do prédio: quem passou a conta para quem, e quando. */
  listByBuilding(buildingId: string) {
    return prisma.buildingOwnershipTransfer.findMany({
      where: { building_id: buildingId },
      include: COM_PESSOAS,
      orderBy: { requested_at: 'desc' },
    });
  },

  /** Fecha o pedido com a resposta que ele teve. */
  respond(id: string, status: string, at = new Date()) {
    return prisma.buildingOwnershipTransfer.update({
      where: { id },
      data: { status, responded_at: at },
      include: COM_PESSOAS,
    });
  },

  /**
   * Aceitar é uma transação só: o prédio troca de dono e o pedido fecha.
   *
   * Os dois passos são um fato só. Separados, uma falha no meio deixaria o
   * prédio com dono novo e o pedido ainda de pé — ou o contrário, que é pior:
   * o pedido aceito e a cobrança parada em quem saiu.
   */
  accept(id: string, buildingId: string, toManagerId: string, at = new Date()) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.buildingOwnershipTransfer.update({
        where: { id },
        data: { status: TRANSFER_STATUS.ACEITO, responded_at: at },
        include: COM_PESSOAS,
      });

      await tx.building.update({
        where: { id: buildingId },
        data: { owner_manager_id: toManagerId },
      });

      return transfer;
    });
  },

  /**
   * Os pedidos que venceram sem resposta.
   *
   * Lidos por prazo, e não por um `status = 'EXPIRADO'` que ninguém escreveu:
   * o silêncio não gera evento, e é só a data que sabe que ele aconteceu.
   */
  listExpired(now = new Date()) {
    return prisma.buildingOwnershipTransfer.findMany({
      where: { status: TRANSFER_STATUS.PENDENTE, expires_at: { lte: now } },
      include: COM_PESSOAS,
    });
  },
};
