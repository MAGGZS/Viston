import { FeedbackStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Quem mandou, no que a tela do admin precisa mostrar. Nunca traz senha. */
const AUTHOR_FIELDS = {
  id: true,
  name: true,
  email: true,
  avatar_url: true,
} as const;

const WITH_AUTHOR = {
  user: { select: AUTHOR_FIELDS },
  manager: { select: AUTHOR_FIELDS },
} as const;

export type FeedbackWithAuthor = Prisma.FeedbackGetPayload<{ include: typeof WITH_AUTHOR }>;

export const feedbackRepository = {
  create(data: { user_id?: string; manager_id?: string; message: string }) {
    return prisma.feedback.create({
      data: {
        message: data.message,
        ...(data.user_id ? { user: { connect: { id: data.user_id } } } : {}),
        ...(data.manager_id ? { manager: { connect: { id: data.manager_id } } } : {}),
      },
      include: WITH_AUTHOR,
    });
  },

  findById(id: string) {
    return prisma.feedback.findUnique({ where: { id }, include: WITH_AUTHOR });
  },

  /**
   * A caixa do admin, sempre de um status por vez.
   *
   * Sem paginação de propósito: as três listas são de leitura e esvaziam pela
   * mão do admin — o pendente vira tarefa ou some, e o que fica é o que ele
   * escolheu guardar. Se um dia crescerem, o índice `(status, created_at)` já
   * está no lugar para paginar.
   */
  findByStatus(status: FeedbackStatus) {
    return prisma.feedback.findMany({
      where: { status },
      include: WITH_AUTHOR,
      orderBy: { created_at: 'desc' },
    });
  },

  /**
   * O que a própria conta mandou — a lista dentro da caixa do perfil.
   *
   * Sem `status`: para quem manda, o que importa é que o feedback chegou. Onde
   * o admin o colocou depois é decisão de trabalho dele, e o que ele descarta
   * some da lista por já não existir linha. Selecionar em vez de devolver a
   * linha inteira mantém a decisão no servidor — o destino não sai daqui nem
   * para quem abrir a resposta da rota.
   */
  findByAuthor(author: { user_id?: string; manager_id?: string }) {
    return prisma.feedback.findMany({
      where: author.manager_id ? { manager_id: author.manager_id } : { user_id: author.user_id },
      select: { id: true, message: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
  },

  updateStatus(id: string, status: FeedbackStatus) {
    return prisma.feedback.update({
      where: { id },
      data: { status, reviewed_at: new Date() },
      include: WITH_AUTHOR,
    });
  },

  /** Descartar é apagar: não existe status de descarte (ver a migration). */
  remove(id: string) {
    return prisma.feedback.delete({ where: { id } });
  },

  countPending() {
    return prisma.feedback.count({ where: { status: FeedbackStatus.PENDENTE } });
  },
};
