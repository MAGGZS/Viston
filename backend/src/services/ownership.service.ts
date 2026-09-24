import { AuditAction } from '@prisma/client';
import {
  ownershipRepository,
  PRAZO_TRANSFERENCIA_DIAS,
  TRANSFER_STATUS,
} from '../repositories/ownership.repository';
import { buildingRepository, auditRepository, actorAudit } from '../repositories/building.repository';
import { managerRepository } from '../repositories/manager.repository';
import { planGate } from '../middlewares/planGate';
import { Actor } from '../middlewares/authenticate';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { logger } from '../lib/logger';

/**
 * A troca de dono do prédio.
 *
 * Passar o prédio adiante é passar a conta adiante, e por isso não é um clique
 * só de quem sai: o co-gestor indicado recebe uma solicitação de
 * comprometimento e precisa aceitar. Aceite transfere; recusa ou silêncio de
 * sete dias inativa o prédio, e reativar passa pelo admin.
 *
 * O prazo existe para que o prédio não fique em suspenso para sempre: sem ele,
 * um pedido esquecido deixaria a cobrança parada em quem já foi embora e o
 * prédio sem ninguém que responda por ele.
 *
 * Congelar na recusa parece duro, e é a única saída honesta: quem pediu para
 * sair não pode ser obrigado a continuar pagando, e o prédio não pode seguir
 * funcionando sem uma conta que responda por ele. Congelado, nada se perde — o
 * histórico continua lá, e o admin reativa assim que houver um dono.
 */

/** Só o dono do prédio passa a conta adiante. */
async function assertOwner(buildingId: string, actor: Actor) {
  const building = await buildingRepository.findById(buildingId);
  if (!building) throw new NotFoundError('Prédio');

  if (actor.kind !== 'MANAGER' || building.owner_manager_id !== actor.id) {
    throw new ForbiddenError('Só quem paga pelo prédio pode passá-lo adiante');
  }

  return building;
}

export const ownershipService = {
  /**
   * Abre o pedido de transferência.
   *
   * O indicado precisa já ser co-gestor do prédio: passar a conta a quem nunca
   * entrou nele seria entregar um prédio a um estranho, e o caminho de entrada
   * (`POST /buildings/:id/managers`) já tem o limite do plano na frente.
   */
  async request(buildingId: string, toManagerId: string, actor: Actor) {
    const building = await assertOwner(buildingId, actor);

    if (toManagerId === building.owner_manager_id) {
      throw new ConflictError('Este prédio já é seu');
    }

    const vinculo = await buildingRepository.findManagerLink(buildingId, toManagerId);
    if (!vinculo) {
      throw new ConflictError('Indique alguém que já seja gestor deste prédio');
    }

    const manager = await managerRepository.findById(toManagerId);
    if (!manager || manager.status === 'DELETED') throw new NotFoundError('Gestor');
    if (manager.suspended_at) {
      throw new ConflictError('Esta conta está suspensa e não pode receber o prédio');
    }

    const aberto = await ownershipRepository.findPendingByBuilding(buildingId);
    if (aberto) throw new ConflictError('Este prédio já tem um pedido de transferência aberto');

    const expires_at = new Date(Date.now() + PRAZO_TRANSFERENCIA_DIAS * 24 * 60 * 60 * 1000);
    const pedido = await ownershipRepository.create({
      building_id: buildingId,
      from_manager_id: actor.id,
      to_manager_id: toManagerId,
      expires_at,
    });

    await auditRepository.log({
      ...actorAudit(actor),
      building_id: buildingId,
      action: AuditAction.CREATE,
      entity: 'BuildingOwnershipTransfer',
      entity_id: pedido.id,
      metadata: { to_manager_id: toManagerId, expires_at },
    });

    return pedido;
  },

  /** O que espera resposta desta conta. */
  listMine(actor: Actor) {
    if (actor.kind !== 'MANAGER') return [];
    return ownershipRepository.listPendingFor(actor.id);
  },

  /** O histórico de quem pagou por este prédio. */
  async listByBuilding(buildingId: string) {
    const building = await buildingRepository.findById(buildingId);
    if (!building) throw new NotFoundError('Prédio');
    return ownershipRepository.listByBuilding(buildingId);
  },

  /**
   * A resposta do indicado.
   *
   * Aceitar confere o plano de quem recebe: o prédio entra na conta dele, e uma
   * conta no LIVRE que já tem o seu não comporta o segundo. Barrar aqui é
   * melhor que aceitar e deixar a conta estourada — o pedido continua de pé, e
   * ele resolve o plano antes de aceitar de novo.
   */
  async respond(transferId: string, accept: boolean, actor: Actor) {
    const pedido = await ownershipRepository.findById(transferId);
    if (!pedido) throw new NotFoundError('Pedido de transferência');

    if (actor.kind !== 'MANAGER' || pedido.to_manager_id !== actor.id) {
      throw new ForbiddenError('Este pedido não é seu');
    }
    if (pedido.status !== TRANSFER_STATUS.PENDENTE) {
      throw new ConflictError('Este pedido já foi respondido');
    }
    if (pedido.expires_at <= new Date()) {
      throw new ConflictError('O prazo deste pedido venceu');
    }

    if (!accept) return this.refuse(pedido, actor);

    await planGate.assertCanCreateBuilding(actor.id, actor);

    const aceito = await ownershipRepository.accept(
      pedido.id,
      pedido.building_id,
      pedido.to_manager_id
    );

    await auditRepository.log({
      ...actorAudit(actor),
      building_id: pedido.building_id,
      action: AuditAction.UPDATE,
      entity: 'Building',
      entity_id: pedido.building_id,
      metadata: {
        owner_from: pedido.from_manager_id,
        owner_to: pedido.to_manager_id,
        transfer_id: pedido.id,
      },
    });

    return aceito;
  },

  /** Recusar fecha o pedido e inativa o prédio: ninguém ficou respondendo por ele. */
  async refuse(
    pedido: { id: string; building_id: string; from_manager_id: string },
    actor: Actor
  ) {
    const recusado = await ownershipRepository.respond(pedido.id, TRANSFER_STATUS.RECUSADO);
    await freezeBuilding(pedido.building_id, actorAudit(actor), 'transferencia_recusada');
    return recusado;
  },

  /**
   * Os pedidos vencidos, fechados de uma vez.
   *
   * Silêncio não gera evento: é a passagem do tempo que decide, e alguém
   * precisa perguntar as horas. Hoje quem pergunta é o job diário (ver
   * `jobs/planos`), e o mesmo método serve a uma chamada manual do admin.
   */
  async expireOverdue(now = new Date()) {
    const vencidos = await ownershipRepository.listExpired(now);

    for (const pedido of vencidos) {
      try {
        await ownershipRepository.respond(pedido.id, TRANSFER_STATUS.EXPIRADO, now);
        await freezeBuilding(pedido.building_id, {}, 'transferencia_sem_resposta');
      } catch (err) {
        logger.error(
          { err, transfer_id: pedido.id },
          '[Transferência] Falha ao encerrar pedido vencido'
        );
      }
    }

    return { expired: vencidos.length };
  },
};

/** Inativa o prédio e deixa o motivo na trilha. Já inativo, não repete o carimbo. */
async function freezeBuilding(
  buildingId: string,
  ator: { user_id?: string; manager_id?: string },
  motivo: string
): Promise<void> {
  const building = await buildingRepository.findById(buildingId);
  if (!building || building.frozen_at) return;

  await buildingRepository.setFrozen(buildingId, true);
  await auditRepository.log({
    ...ator,
    building_id: buildingId,
    action: AuditAction.BUILDING_FROZEN,
    entity: 'Building',
    entity_id: buildingId,
    metadata: { frozen: true, motivo },
  });
}
