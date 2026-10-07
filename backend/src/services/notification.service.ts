import { notificationRepository } from '../repositories/notification.repository';
import { ScheduleRow } from '../repositories/schedule.repository';
import { Actor } from '../middlewares/authenticate';
import { enviarEmail } from '../lib/mailer';
import { emailAgenda, TipoAvisoAgenda } from '../templates/email';
import { planService } from './plan.service';
import { usageService } from './usage.service';
import { logger } from '../lib/logger';
import { NotFoundError } from '../utils/errors';
import { sortFloorsDesc } from '../utils/floorOrder';

/** Quem recebe o aviso: a conta do inspetor, como o repositório a devolve. */
type Destinatario = { id: string; name: string; email: string; status: string };

/** `Date` de coluna DATE para `yyyy-MM-dd`. */
const dia = (d: Date) => d.toISOString().slice(0, 10);

/**
 * O que o aviso carrega para a tela escrever a frase sem outra consulta.
 *
 * Os andares vão como texto, já ordenados: o aviso é uma fotografia do momento
 * em que foi mandado, e se o andar mudar de nome depois, o aviso antigo
 * continua dizendo o que disse.
 */
export function schedulePayload(schedule: ScheduleRow) {
  return {
    schedule_id: schedule.id,
    building_name: schedule.building.name,
    scheduled_date: dia(schedule.scheduled_date),
    due_date: dia(schedule.due_date),
    floors: sortFloorsDesc(schedule.floors.map((f) => f.floor)).map((f) => f.label),
  };
}

/**
 * Manda o e-mail se a conta que paga pelo prédio ainda tem cota no mês.
 *
 * A cota é do dono do prédio (`owner_manager_id`), como todo limite do plano:
 * o inspetor não tem plano nenhum. Prédio sem dono não é barrado — o mesmo
 * critério do `planGate` —, e o envio não conta para ninguém.
 *
 * Devolve se mandou. Estourar a cota não é erro: o aviso continua no sino.
 */
async function enviarComCota(
  ownerManagerId: string | null,
  para: string,
  mensagem: { assunto: string; html: string; texto: string }
): Promise<boolean> {
  if (ownerManagerId) {
    const [plano, enviados] = await Promise.all([
      planService.resolvePlan(ownerManagerId),
      usageService.emailsSent(ownerManagerId),
    ]);
    if (enviados >= plano.limits.emailsPerMonth) {
      logger.warn(
        { manager_id: ownerManagerId, enviados, limite: plano.limits.emailsPerMonth },
        '[Agenda] Cota de e-mails do mês esgotada — aviso só no sino'
      );
      return false;
    }
  }

  await enviarEmail(para, mensagem.assunto, mensagem.html, mensagem.texto);
  if (ownerManagerId) await usageService.recordEmail(ownerManagerId);
  return true;
}

export const notificationService = {
  /**
   * Avisa o inspetor sobre uma ronda: sino e e-mail.
   *
   * O sino é gravado antes de devolver, e uma falha nele só vai para o log — o
   * aviso é consequência da escrita, não parte dela, e quem marcou a ronda não
   * pode receber erro por causa do sino.
   *
   * O e-mail sai depois, e quem chama decide se espera: a rota não espera
   * (a resposta não fica presa no provedor de e-mail), o ciclo diário espera
   * (não há ninguém do outro lado da tela, e mandar em série é mais gentil com
   * o teto do provedor). A promessa devolvida nunca rejeita.
   */
  async notifySchedule(
    type: TipoAvisoAgenda,
    schedule: ScheduleRow,
    destinatario: Destinatario | null
  ): Promise<{ email: Promise<boolean> }> {
    // Conta que saiu do sistema não recebe nada: nem sino, nem e-mail.
    if (!destinatario || destinatario.status !== 'ACTIVE') {
      return { email: Promise.resolve(false) };
    }

    const payload = schedulePayload(schedule);

    try {
      await notificationRepository.create({
        user_id: destinatario.id,
        building_id: schedule.building_id,
        type,
        payload,
      });
    } catch (err) {
      logger.error({ err, schedule_id: schedule.id, type }, '[Agenda] Falha ao gravar o aviso no sino');
    }

    const mensagem = emailAgenda(type, destinatario.name, {
      predio: payload.building_name,
      inicio: payload.scheduled_date,
      prazo: payload.due_date,
      andares: payload.floors,
    });

    const email = enviarComCota(schedule.building.owner_manager_id, destinatario.email, mensagem).catch(
      (err) => {
        logger.error({ err, schedule_id: schedule.id, type }, '[Agenda] Falha ao mandar o aviso por e-mail');
        return false;
      }
    );

    return { email };
  },

  /**
   * O sino de quem pede. Só conta de usuário tem sino: é quem vistoria, e é
   * quem a agenda avisa. O gestor recebe a lista vazia, e não um erro — a tela
   * é a mesma para os dois.
   */
  async list(actor: Actor, limit: number) {
    if (actor.kind !== 'USER') return { notifications: [], unread: 0 };

    const [notifications, unread] = await Promise.all([
      notificationRepository.listForUser(actor.id, limit),
      notificationRepository.countUnread(actor.id),
    ]);
    return { notifications, unread };
  },

  /** Marca um aviso como lido. Ler de novo o que já foi lido não é erro. */
  async markRead(actor: Actor, id: string) {
    if (actor.kind !== 'USER') throw new NotFoundError('Aviso');
    const aviso = await notificationRepository.findOwned(id, actor.id);
    if (!aviso) throw new NotFoundError('Aviso');
    await notificationRepository.markRead(id, actor.id, new Date());
  },

  async markAllRead(actor: Actor) {
    if (actor.kind !== 'USER') return;
    await notificationRepository.markAllRead(actor.id, new Date());
  },
};
