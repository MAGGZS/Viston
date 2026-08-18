import { z } from 'zod';

/**
 * As três telas de chamado do moderador, e o que cada uma pergunta ao banco.
 *
 * O agrupamento existe porque "em andamento" não é um status só: o chamado que
 * o responsável já disse ter terminado continua correndo até o moderador
 * fechar, e some da tela dele se for tratado como concluído.
 */
export const TICKET_GROUPS = {
  NOVOS: ['ABERTO'],
  ANDAMENTO: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO', 'AGUARDANDO_FECHAMENTO'],
  CONCLUIDOS: ['CONCLUIDO'],
} as const;

export type TicketGroup = keyof typeof TICKET_GROUPS;

export const ticketFiltersSchema = z.object({
  group: z.enum(['NOVOS', 'ANDAMENTO', 'CONCLUIDOS']).default('NOVOS'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

/** Encaminhar: o chamado ganha dono e passa a correr. */
export const forwardTicketSchema = z
  .object({
    responsible_id: z.string().uuid('Selecione um responsável'),
  })
  .strict();

/**
 * O que o moderador acrescenta ao chamado em andamento.
 *
 * `maintenance_cost` chega como número e é gravado em DECIMAL: dinheiro não
 * mora em ponto flutuante. Nulo apaga o valor lançado antes.
 */
export const updateTicketSchema = z
  .object({
    responsible_id: z.string().uuid().nullable().optional(),
    maintenance_note: z.string().trim().max(2000).nullable().optional(),
    maintenance_cost: z
      .number()
      .min(0, 'Valor não pode ser negativo')
      .max(99_999_999.99, 'Valor fora da faixa')
      .nullable()
      .optional(),
    // Fechar não passa por aqui: tem rota própria, porque é a única coisa que
    // só o moderador pode fazer e a que encerra o chamado.
    status: z.enum(['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO']).optional(),
  })
  .strict();
