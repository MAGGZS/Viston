import { z } from 'zod';

/**
 * As telas de chamado do moderador, e o que cada uma pergunta ao banco.
 *
 * O agrupamento existe porque "em andamento" não é um status só: o chamado que
 * o responsável já disse ter terminado continua correndo até o moderador
 * fechar, e some da tela dele se for tratado como concluído.
 *
 * ENCAMINHADOS é tela própria, e não parte de ANDAMENTO, porque é justamente o
 * que ainda não anda: o chamado foi mandado e espera o responsável confirmar
 * que o recebeu. Somá-lo ao que está sendo feito apagaria a única fila que o
 * moderador precisa cobrar.
 *
 * TODOS não é tela: é o histórico de ocorrências do prédio, que lê a linha do
 * tempo inteira de uma vez, em vez de pedir um grupo de cada vez.
 */
export const TICKET_GROUPS = {
  NOVOS: ['ABERTO'],
  ENCAMINHADOS: ['ENCAMINHADO'],
  ANDAMENTO: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO', 'AGUARDANDO_FECHAMENTO'],
  CONCLUIDOS: ['CONCLUIDO'],
  TODOS: [
    'ABERTO',
    'ENCAMINHADO',
    'EM_ANDAMENTO',
    'AGUARDANDO_TERCEIRO',
    'AGUARDANDO_FECHAMENTO',
    'CONCLUIDO',
  ],
} as const;

export type TicketGroup = keyof typeof TICKET_GROUPS;

export const ticketFiltersSchema = z.object({
  group: z.enum(['NOVOS', 'ENCAMINHADOS', 'ANDAMENTO', 'CONCLUIDOS', 'TODOS']).default('NOVOS'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
});

/** Encaminhar: o chamado ganha dono e passa a esperar o aceite dele. */
export const forwardTicketSchema = z
  .object({
    responsible_id: z.string().uuid('Selecione um responsável'),
  })
  .strict();

/**
 * O relatório do responsável ao concluir.
 *
 * Opcional: nem toda manutenção tem o que relatar, e obrigar o campo só encheria
 * o banco de "ok". O corpo inteiro pode vir vazio — é o que o app manda quando a
 * pessoa concluiu sem escrever nada.
 */
export const reportDoneSchema = z
  .object({
    done_report: z.string().trim().max(2000).nullable().optional(),
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
