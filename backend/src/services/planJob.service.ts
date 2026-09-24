import { AuditAction } from '@prisma/client';
import { ownershipService } from './ownership.service';
import { planService } from './plan.service';
import { buildingRepository, auditRepository } from '../repositories/building.repository';
import { logger } from '../lib/logger';

/**
 * A passagem do tempo, uma vez por dia.
 *
 * Quase tudo no produto acontece porque alguém clicou. Três coisas acontecem
 * porque o tempo passou, e sem alguém para perguntar as horas elas simplesmente
 * não acontecem:
 *
 * 1. O pedido de transferência que ninguém respondeu em sete dias.
 * 2. A assinatura que caiu (cancelada, não paga) e deixou a conta com mais
 *    prédios do que o plano dela comporta.
 * 3. A concessão do admin que venceu, pelo mesmo efeito.
 *
 * Congelar é o que sobra, e é reversível: o prédio continua sendo lido, e volta
 * inteiro quando a conta se regulariza (o admin reativa, ver
 * `planAdminService.setFreeze`). Apagar nunca esteve em questão — o histórico é
 * do cliente, e ele pode querer o dele de volta em seis meses.
 *
 * Quem congela é o excesso, e o excesso é o mais novo: o prédio mais antigo é o
 * que a conta usa todo dia, e cortá-lo primeiro seria cortar justamente o que a
 * pessoa vai reclamar em seguida. Ordenar por data também torna a escolha
 * previsível — quem lê a regra sabe de antemão qual prédio vai parar.
 */
export const planJobService = {
  /**
   * O ciclo inteiro. Nada aqui interrompe o resto: cada parte falha sozinha, e
   * o dia seguinte tenta de novo.
   */
  async runDaily(now = new Date()) {
    const transferencias = await ownershipService
      .expireOverdue(now)
      .catch((err) => {
        logger.error({ err }, '[Planos] Falha ao vencer transferências');
        return { expired: 0 };
      });

    const congelamentos = await this.freezeOverLimit().catch((err) => {
      logger.error({ err }, '[Planos] Falha ao congelar prédios fora do plano');
      return { frozen: 0, checked: 0 };
    });

    logger.info(
      { transferencias: transferencias.expired, ...congelamentos },
      '[Planos] Ciclo diário concluído'
    );

    return { transfers_expired: transferencias.expired, ...congelamentos };
  },

  /**
   * Congela o que passa do teto de cada conta.
   *
   * Só olha quem tem prédio: a conta sem nenhum não tem o que congelar, e
   * varrer a tabela inteira de gestores a cada dia custaria sem responder nada.
   */
  async freezeOverLimit() {
    const donos = await buildingRepository.listOwnersWithBuildings();
    let frozen = 0;

    for (const managerId of donos) {
      try {
        frozen += await congelarExcedente(managerId);
      } catch (err) {
        logger.error({ err, manager_id: managerId }, '[Planos] Falha ao avaliar conta');
      }
    }

    return { frozen, checked: donos.length };
  },
};

/**
 * O excedente de uma conta, congelado — e o que voltou a caber, descongelado.
 *
 * O caminho de volta importa tanto quanto o de ida: quem pagou de novo, ou
 * ganhou concessão do admin, tem os prédios de volta no ciclo seguinte sem
 * precisar pedir. Só volta o que este mesmo caminho congelou (`motivo:
 * 'fora_do_plano'`); prédio inativado por transferência recusada continua
 * inativo, porque o problema dele é outro — não tem dono que responda.
 */
async function congelarExcedente(managerId: string): Promise<number> {
  const plano = await planService.resolvePlan(managerId);
  const predios = await buildingRepository.listOwnedByManager(managerId);

  const dentro = predios.slice(0, plano.buildingsAllowed);
  const fora = predios.slice(plano.buildingsAllowed);

  let congelados = 0;

  for (const predio of fora) {
    if (predio.frozen_at) continue;
    await buildingRepository.setFrozen(predio.id, true);
    await auditRepository.log({
      manager_id: managerId,
      building_id: predio.id,
      action: AuditAction.BUILDING_FROZEN,
      entity: 'Building',
      entity_id: predio.id,
      metadata: { frozen: true, motivo: 'fora_do_plano', plano: plano.code },
    });
    congelados += 1;
  }

  for (const predio of dentro) {
    if (!predio.frozen_at) continue;
    if (!(await foiCongeladoPeloPlano(predio.id))) continue;

    await buildingRepository.setFrozen(predio.id, false);
    await auditRepository.log({
      manager_id: managerId,
      building_id: predio.id,
      action: AuditAction.BUILDING_FROZEN,
      entity: 'Building',
      entity_id: predio.id,
      metadata: { frozen: false, motivo: 'plano_regularizado', plano: plano.code },
    });
  }

  return congelados;
}

/** O último congelamento deste prédio foi por plano, e não por transferência? */
async function foiCongeladoPeloPlano(buildingId: string): Promise<boolean> {
  const ultimo = await auditRepository.lastFreezeOf(buildingId);
  const metadata = (ultimo?.metadata ?? {}) as { motivo?: string; frozen?: boolean };
  return metadata.frozen === true && metadata.motivo === 'fora_do_plano';
}

