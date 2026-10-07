import { scheduleRepository } from '../repositories/schedule.repository';
import { notificationService } from './notification.service';
import { toDateOnly } from './schedule.service';
import { zonedDayKey } from '../utils/timezone';
import { logger } from '../lib/logger';

/**
 * O lembrete da agenda, uma vez por dia: "o prazo vence amanhã" (ou "hoje",
 * para a ronda que o ciclo não pegou na véspera).
 *
 * Sai uma vez por ronda — `due_soon_notified_at` é marcado antes do aviso, e só
 * avisa quem conseguiu marcar. Rodar o ciclo duas vezes no mesmo dia (o
 * agendador do GitHub às vezes repete, e há o disparo manual) não manda nada em
 * dobro.
 *
 * Atraso não vira aviso para o inspetor, por decisão do proprietário: ele é só
 * visual, na agenda (ver `overdue` e `past_deadline` em `serializeSchedule`).
 *
 * A ronda cujo inspetor saiu do prédio também é marcada, sem aviso: senão ela
 * voltaria à lista todo dia até o prazo.
 */
export const scheduleJobService = {
  async runDaily(now = new Date()) {
    const hoje = toDateOnly(zonedDayKey(now));
    const amanha = new Date(hoje);
    amanha.setUTCDate(amanha.getUTCDate() + 1);

    const vencendo = await lembrarPrazo(hoje, amanha, now).catch((err) => {
      logger.error({ err }, '[Agenda] Falha nos lembretes de prazo');
      return 0;
    });

    logger.info({ due_soon: vencendo }, '[Agenda] Ciclo diário concluído');
    return { due_soon: vencendo };
  },
};

/**
 * Marca e avisa cada ronda com prazo hoje ou amanhã. Devolve quantos avisos
 * saíram.
 *
 * `planScope` é a cache do plano desta execução: o plano de cada dono de prédio
 * é resolvido uma vez só, e não uma vez por ronda. A cota em si não é lida —
 * cada envio a reserva no banco (ver `notificationService`).
 */
async function lembrarPrazo(hoje: Date, amanha: Date, now: Date): Promise<number> {
  const candidatas = await scheduleRepository.listDueSoonCandidates(hoje, amanha);
  if (candidatas.length === 0) return 0;

  const validos = await scheduleRepository.activeInspectorPairs(
    candidatas
      .filter((c) => c.inspector_id)
      .map((c) => ({ building_id: c.building_id, user_id: c.inspector_id as string }))
  );

  const planScope = {};
  let avisados = 0;
  for (const ronda of candidatas) {
    try {
      if (!(await scheduleRepository.claimDueSoon(ronda.id, now))) continue;

      const ehInspetor = ronda.inspector_id && validos.has(`${ronda.building_id}:${ronda.inspector_id}`);
      if (!ehInspetor) continue;

      const { email } = await notificationService.notifySchedule('SCHEDULE_DUE_SOON', ronda, ronda.inspector, {
        planScope,
        now,
      });
      await email;
      avisados += 1;
    } catch (err) {
      logger.error({ err, schedule_id: ronda.id }, '[Agenda] Falha ao lembrar a ronda');
    }
  }
  return avisados;
}
