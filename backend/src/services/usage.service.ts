import { usageRepository } from '../repositories/usage.repository';
import { logger } from '../lib/logger';
import { photoObjectPath } from './storage.service';
import { zonedDayKey } from '../utils/timezone';

/**
 * O que cada conta já gastou dos limites do plano.
 *
 * Só conta — não barra nada. O gating vem depois, e de propósito: ligar a
 * medição e o limite no mesmo dia barraria a conta com 30 GB cujo contador
 * ainda diz zero, e liberaria quem já estourou. Primeiro os números ficam
 * certos; depois eles passam a valer.
 *
 * Nada aqui pode derrubar o trabalho de quem está do outro lado da tela. Uma
 * foto que subiu e não foi contada é um número errado para menos; uma foto que
 * não subiu porque a contagem falhou é trabalho perdido. Por isso todo caminho
 * de escrita engole o erro e registra no log.
 */

/** O mês do contador, no fuso do produto: `2026-09`. */
export function currentPeriod(date = new Date()): string {
  return zonedDayKey(date).slice(0, 7);
}

export const usageService = {
  currentPeriod,

  /**
   * Registra o espaço das fotos que acabaram de subir.
   *
   * Recebe a URL pública porque é o que os serviços têm em mãos depois do
   * upload; o que se guarda é o caminho do objeto, que é a identidade da foto
   * no bucket e o que sobrevive a uma troca de domínio.
   *
   * Avatar não passa por aqui: ele não pertence a prédio nenhum, e o limite do
   * plano é o das fotos de manutenção, que são as que crescem sem parar.
   */
  async recordPhotos(
    buildingId: string,
    photos: { url: string; bytes: number }[]
  ): Promise<void> {
    if (photos.length === 0) return;

    const assets = photos
      .map(({ url, bytes }) => ({ path: photoObjectPath(url), bytes }))
      .filter((a): a is { path: string; bytes: number } => a.path !== null)
      .map(({ path, bytes }) => ({ building_id: buildingId, path, bytes }));

    try {
      await usageRepository.createPhotoAssets(assets);
    } catch (err) {
      logger.error({ err, building_id: buildingId }, '[Uso] Falha ao contar fotos enviadas');
    }
  },

  /** Esquece fotos que saíram do bucket — o espaço volta para a conta. */
  async forgetPhotos(urls: string[]): Promise<void> {
    const paths = urls
      .map((url) => photoObjectPath(url))
      .filter((path): path is string => path !== null);

    if (paths.length === 0) return;

    try {
      await usageRepository.deletePhotoAssets(paths);
    } catch (err) {
      logger.error({ err }, '[Uso] Falha ao descontar fotos removidas');
    }
  },

  /**
   * Soma um envio de e-mail ao mês da conta de gestor.
   *
   * Só conta de gestor: é dela a assinatura, e é dela o teto mensal. A conta de
   * usuário não tem plano — quem responde pelo que ela consome é o prédio a que
   * ela está vinculada, e esse rateio não existe hoje nem faz falta enquanto o
   * que sai daqui é código de confirmação e de troca de senha.
   */
  async recordEmail(managerId: string, count = 1): Promise<void> {
    try {
      await usageRepository.incrementEmails(managerId, currentPeriod(), count);
    } catch (err) {
      logger.error({ err, manager_id: managerId }, '[Uso] Falha ao contar e-mail enviado');
    }
  },

  /** Quanto as fotos dos prédios desta conta ocupam, em bytes. */
  async storageUsedBytes(managerId: string): Promise<number> {
    return Number(await usageRepository.sumPhotoBytes(managerId));
  },

  /** Quantos e-mails a conta já mandou no mês corrente. */
  async emailsSent(managerId: string, period = currentPeriod()): Promise<number> {
    const counter = await usageRepository.findCounter(managerId, period);
    return counter?.emails_sent ?? 0;
  },
};
