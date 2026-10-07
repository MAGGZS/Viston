import { notificationRepository } from '../repositories/notification.repository';
import { ScheduleRow } from '../repositories/schedule.repository';
import { Actor } from '../middlewares/authenticate';
import { enviarEmail } from '../lib/mailer';
import { emailAgenda, TipoAvisoAgenda } from '../templates/email';
import { planService } from './plan.service';
import { currentPeriod, usageService } from './usage.service';
import { logger } from '../lib/logger';
import { config } from '../config';
import { NotFoundError } from '../utils/errors';
import { sortFloorsDesc } from '../utils/floorOrder';
import { zonedDayKey } from '../utils/timezone';

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

/** O escopo do teto diário em `email_daily_counters`. */
const ESCOPO_DIARIO = 'AGENDA';

/**
 * Manda o e-mail se a conta que paga pelo prédio ainda tem cota no mês.
 *
 * A cota é do dono do prédio (`owner_manager_id`), como todo limite do plano:
 * o inspetor não tem plano nenhum.
 *
 * O envio é reservado no contador antes de sair, num comando só no banco (ver
 * `usageRepository.reserveEmail`): duas rondas marcadas no mesmo instante não
 * passam as duas do teto. Se o provedor recusar, a reserva é devolvida.
 *
 * Há ainda um teto diário do sistema inteiro (`config.email.agendaDailyCap`,
 * 150 por padrão), só para os e-mails da agenda — os de verificação e de
 * recuperação de senha não passam por aqui e nunca são barrados por ele.
 *
 * Prédio sem dono não manda e-mail da agenda: não há conta para medir a cota,
 * e um prédio órfão não pode virar canal de e-mail sem teto. O aviso fica só
 * no sino.
 *
 * `planScope` dá vida à cache do plano (ver `planService.resolvePlan`): o
 * ciclo diário passa um objeto seu e resolve o plano de cada dono uma vez só.
 *
 * Devolve se mandou. Estourar a cota não é erro: o aviso continua no sino.
 */
async function enviarComCota(
  ownerManagerId: string | null,
  para: string,
  mensagem: { assunto: string; html: string; texto: string },
  planScope?: object
): Promise<boolean> {
  if (!ownerManagerId) {
    logger.info('[Agenda] Prédio sem dono — aviso só no sino');
    return false;
  }

  const plano = await planService.resolvePlan(ownerManagerId, planScope);
  const periodo = currentPeriod();
  const reservou = await usageService.reserveEmail(ownerManagerId, plano.limits.emailsPerMonth, periodo);
  if (!reservou) {
    logger.warn(
      { manager_id: ownerManagerId, limite: plano.limits.emailsPerMonth },
      '[Agenda] Cota de e-mails do mês esgotada — aviso só no sino'
    );
    return false;
  }

  // Depois da cota do cliente, o teto diário do sistema (todos os clientes
  // somados): segura o provedor de e-mail num dia de agenda em massa.
  const hoje = zonedDayKey(new Date());
  const cabeNoDia = await usageService
    .reserveDailyEmail(ESCOPO_DIARIO, config.email.agendaDailyCap, hoje)
    .catch(async (err) => {
      await usageService.releaseEmail(ownerManagerId, periodo);
      throw err;
    });
  if (!cabeNoDia) {
    await usageService.releaseEmail(ownerManagerId, periodo);
    logger.warn(
      { limite_diario: config.email.agendaDailyCap },
      '[Agenda] Teto diário de e-mails do sistema atingido — aviso só no sino'
    );
    return false;
  }

  try {
    await enviarEmail(para, mensagem.assunto, mensagem.html, mensagem.texto);
  } catch (err) {
    await Promise.all([
      usageService.releaseEmail(ownerManagerId, periodo),
      usageService.releaseDailyEmail(ESCOPO_DIARIO, hoje),
    ]);
    throw err;
  }
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
    destinatario: Destinatario | null,
    opts: { planScope?: object; now?: Date } = {}
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
      // O lembrete sai para prazo de hoje ou de amanhã (ver o ciclo diário).
      venceHoje: type === 'SCHEDULE_DUE_SOON' && payload.due_date === zonedDayKey(opts.now ?? new Date()),
    });

    const email = enviarComCota(
      schedule.building.owner_manager_id,
      destinatario.email,
      mensagem,
      opts.planScope
    ).catch(
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
  async list(actor: Actor, limit: number, buildingId?: string) {
    if (actor.kind !== 'USER') return { notifications: [], unread: 0 };

    // O filtro por prédio não precisa de checagem de vínculo: o recorte já é
    // "as minhas", e um prédio alheio só devolve lista vazia.
    const [notifications, unread] = await Promise.all([
      notificationRepository.listForUser(actor.id, limit, buildingId),
      notificationRepository.countUnread(actor.id, buildingId),
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

  /**
   * Marca como lidos os avisos da conta. Com `buildingId`, só os daquele
   * prédio: o sino é por prédio, e "marcar todas" num não pode apagar o outro.
   */
  async markAllRead(actor: Actor, buildingId?: string) {
    if (actor.kind !== 'USER') return;
    await notificationRepository.markAllRead(actor.id, new Date(), buildingId);
  },
};
