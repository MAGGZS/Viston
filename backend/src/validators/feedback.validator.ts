import { z } from 'zod';

/**
 * O que a pessoa escreve para o admin.
 *
 * Só a mensagem: quem mandou sai do token, e o status é sempre PENDENTE na
 * entrada — deixar qualquer um dos dois no corpo seria deixar a conta escolher
 * o próprio remetente e já se aprovar como tarefa.
 */
export const createFeedbackSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(5, 'Escreva ao menos 5 caracteres')
      .max(2000, 'O feedback deve ter no máximo 2000 caracteres'),
  })
  .strict();

/**
 * O destino que o admin dá ao feedback.
 *
 * Só TAREFA e MENSAGEM: PENDENTE é de onde ele sai, e não para onde ele volta —
 * a decisão já foi tomada. Descartar não passa por aqui; é DELETE.
 */
export const updateFeedbackSchema = z
  .object({
    status: z.enum(['TAREFA', 'MENSAGEM'], {
      required_error: 'Status deve ser TAREFA ou MENSAGEM',
    }),
  })
  .strict();

/** Filtro da caixa do admin. Sem `status` na query, a lista é a dos pendentes. */
export const listFeedbackQuerySchema = z.object({
  status: z.enum(['PENDENTE', 'TAREFA', 'MENSAGEM']).optional(),
});
