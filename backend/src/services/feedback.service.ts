import { AuditAction, FeedbackStatus } from '@prisma/client';
import { feedbackRepository, FeedbackWithAuthor } from '../repositories/feedback.repository';
import { auditRepository, actorAudit } from '../repositories/building.repository';
import { Actor } from '../middlewares/authenticate';
import { NotFoundError } from '../utils/errors';

/**
 * De quem é o feedback, na coluna certa.
 *
 * Mesma regra do `actorAudit`: usuário e gestor são contas de tabelas
 * diferentes, e a linha guarda uma das duas — nunca as duas.
 */
function authorOf(actor: Actor) {
  return actor.kind === 'MANAGER' ? { manager_id: actor.id } : { user_id: actor.id };
}

/**
 * O feedback como a tela do admin lê: um `author` só, já resolvido.
 *
 * Sem isto a tela teria de decidir entre `user` e `manager` a cada linha —
 * decisão que é do servidor, que sabe qual das duas colunas está preenchida.
 * `author` nulo é a conta que foi apagada; o feedback continua valendo.
 */
function present(feedback: FeedbackWithAuthor) {
  const { user, manager, ...rest } = feedback;
  const author = manager ?? user;

  return {
    ...rest,
    author: author ? { ...author, kind: manager ? ('MANAGER' as const) : ('USER' as const) } : null,
  };
}

export const feedbackService = {
  /**
   * Manda uma sugestão ao admin.
   *
   * Vale para as duas naturezas de conta e não tem limite de quantidade: quem
   * usa o produto todo dia tem mais de uma coisa a dizer, e barrar o segundo
   * envio só faria a pessoa amontoar tudo num texto só.
   */
  async create(actor: Actor, message: string) {
    const author = authorOf(actor);
    const feedback = await feedbackRepository.create({ ...author, message });

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.CREATE,
      entity: 'Feedback',
      entity_id: feedback.id,
    });

    return present(feedback);
  },

  /** O que a própria conta já mandou — a mensagem e a data, só isso. */
  listMine(actor: Actor) {
    return feedbackRepository.findByAuthor(authorOf(actor));
  },

  /**
   * A caixa do admin: uma aba por status.
   *
   * `pending` acompanha a lista pedida porque o aviso de "tem coisa nova" vive
   * fora dela — no menu lateral, visível de qualquer aba.
   */
  async findAll(status: FeedbackStatus) {
    const [feedbacks, pending] = await Promise.all([
      feedbackRepository.findByStatus(status),
      feedbackRepository.countPending(),
    ]);

    return { feedbacks: feedbacks.map(present), pending };
  },

  /**
   * O destino do feedback: virar tarefa ou virar mensagem.
   *
   * Os dois são decisão do admin e param na mesma tela — o que muda é a aba em
   * que a linha passa a aparecer. Refazer a escolha é permitido: um elogio que
   * pede uma providência pode virar tarefa depois.
   */
  async review(id: string, status: FeedbackStatus, actor: Actor) {
    const feedback = await feedbackRepository.findById(id);
    if (!feedback) throw new NotFoundError('Feedback');

    const updated = await feedbackRepository.updateStatus(id, status);

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.UPDATE,
      entity: 'Feedback',
      entity_id: id,
      metadata: { from: feedback.status, to: status },
    });

    return present(updated);
  },

  /**
   * Descarta o feedback.
   *
   * Apaga mesmo, e é o que o admin espera de "descartar": nada de uma quarta
   * lista invisível guardando o que ele decidiu não guardar. O que ele quer
   * manter, ele move para tarefas ou mensagens antes.
   */
  async discard(id: string, actor: Actor) {
    const feedback = await feedbackRepository.findById(id);
    if (!feedback) throw new NotFoundError('Feedback');

    await feedbackRepository.remove(id);

    await auditRepository.log({
      ...actorAudit(actor),
      action: AuditAction.DELETE,
      entity: 'Feedback',
      entity_id: id,
      metadata: { status: feedback.status },
    });
  },
};
