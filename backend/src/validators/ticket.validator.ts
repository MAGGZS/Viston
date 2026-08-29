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
  /**
   * O que o responsável aceitou e ainda está fazendo.
   *
   * É `ANDAMENTO` menos o que já foi dado por terminado. A tela de processamento
   * mostra os dois lado a lado, e somá-los apagaria a distinção que ela existe
   * para mostrar: um ainda está sendo executado, o outro espera decisão do
   * moderador. `ANDAMENTO` continua como estava — é o que a conta do responsável
   * e os contadores usam.
   */
  EXECUCAO: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'],
  /** O que o responsável concluiu e aguarda o moderador finalizar ou devolver. */
  AGUARDANDO_FECHAMENTO: ['AGUARDANDO_FECHAMENTO'],
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

/**
 * Data de filtro vinda da querystring.
 *
 * Mesma razão do histórico de vistorias: com `string`, `?date_from=abc` só
 * falharia lá no Prisma, e um filtro digitado errado viraria 500.
 */
const dateFilter = (label: string) =>
  z.coerce.date({ errorMap: () => ({ message: `${label} inválida` }) }).optional();

/** Vazio é ausência de busca, não busca por "". */
const buscaLivre = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * O que a listagem do prédio aceita perguntar.
 *
 * O `group` continua sendo o recorte grosso das telas do moderador. O resto
 * chegou com a tela ampliada do histórico, que precisa afunilar dentro do
 * grupo: o andar, o dia, o tipo de manutenção, a categoria, a prioridade, o
 * estado exato, quem atende e um texto solto na descrição.
 *
 * `status` não amplia `group`, afunila: a listagem cruza os dois (ver o
 * serviço), então pedir CONCLUIDO dentro do grupo NOVOS devolve nada em vez de
 * furar o recorte da tela.
 */
export const ticketFiltersSchema = z.object({
  group: z
    .enum([
      'NOVOS',
      'ENCAMINHADOS',
      'ANDAMENTO',
      'EXECUCAO',
      'AGUARDANDO_FECHAMENTO',
      'CONCLUIDOS',
      'TODOS',
    ])
    .default('NOVOS'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(30),
  floor_id: z.string().uuid().optional(),
  status: z
    .enum([
      'ABERTO',
      'ENCAMINHADO',
      'EM_ANDAMENTO',
      'AGUARDANDO_TERCEIRO',
      'AGUARDANDO_FECHAMENTO',
      'CONCLUIDO',
    ])
    .optional(),
  maintenance_type: z
    .enum([
      'AR_CONDICIONADO',
      'CIVIL',
      'ELETRICA',
      'EQUIPAMENTO',
      'EVENTOS',
      'HIDRELETRICA',
      'HIGIENIZACAO_LIMPEZA',
      'INFILTRACAO',
      'MARCENARIA',
      'MOVEIS_CADEIRAS',
      'PINTURA',
      'PROJETOR',
      'VAZAMENTO',
    ])
    .optional(),
  category: z.enum(['PREVENTIVA', 'CORRETIVA', 'EMERGENCIAL', 'EVENTOS', 'PROJETOS']).optional(),
  priority: z.enum(['ALTA', 'MEDIA', 'BAIXA']).optional(),
  responsible_id: z.string().uuid().optional(),
  // A data é a do dia vistoriado, não a da criação da linha: é ela que a tela
  // mostra em "Dia", e seria estranho filtrar por uma e ler a outra.
  date_from: dateFilter('Data inicial'),
  date_to: dateFilter('Data final'),
  /** Texto solto na descrição da ocorrência. */
  q: buscaLivre,
});

export type TicketFilters = z.infer<typeof ticketFiltersSchema>;

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

/**
 * O que o moderador escreve ao finalizar.
 *
 * O relatório é dele, e diferente do `done_report` do responsável: um conta o
 * que foi feito, o outro registra a decisão de encerrar. Grava em
 * `maintenance_note` e `maintenance_cost`, que já eram as colunas dessa
 * informação — fechar deixa de ser um carimbo sem contexto.
 *
 * O gasto é opcional porque nem toda manutenção custa. Quando vem, é número:
 * dinheiro vai para DECIMAL, não para ponto flutuante.
 */
export const closeTicketSchema = z
  .object({
    maintenance_note: z.string().trim().max(2000).nullable().optional(),
    maintenance_cost: z
      .number()
      .min(0, 'Valor não pode ser negativo')
      .max(99_999_999.99, 'Valor fora da faixa')
      .nullable()
      .optional(),
  })
  .strict();

/**
 * O período do relatório em .docx.
 *
 * Dia de calendário, não instante: chega como 'AAAA-MM-DD' e o serviço o
 * converte para o intervalo correspondente no fuso do produto. Aceitar um
 * `Date` aqui trocaria o dia de quem pede — '2026-08-01' vira meia-noite UTC,
 * que em São Paulo ainda é 31 de julho, e o relatório de agosto começaria em
 * julho. Ver `utils/timezone`.
 *
 * Um intervalo só, em vez de "mês", "ano" ou "semestre" como opções separadas:
 * a tela traduz a escolha da pessoa em duas datas antes de pedir, e o servidor
 * não precisa conhecer calendário para responder. `to` é inclusivo — quem pede
 * até dia 31 espera o dia 31 inteiro dentro.
 */
const diaDoCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD');

export const ticketReportSchema = z
  .object({
    from: diaDoCalendario,
    to: diaDoCalendario,
  })
  .strict()
  .refine((v) => v.from <= v.to, {
    message: 'A data inicial não pode ser depois da final',
    path: ['from'],
  });

/**
 * O período do resumo do painel — a pizza por status e as barras por categoria.
 *
 * Os mesmos dois campos da listagem, e de propósito: o recorte da tela é o dia
 * da vistoria, como em todo lugar que filtra ocorrência por data. Um nome novo
 * aqui ("from"/"to", como no relatório) faria a mesma pergunta ter duas formas.
 *
 * Os dois são opcionais: sem nenhum, o resumo é o prédio inteiro desde sempre.
 */
export const ticketSummarySchema = z.object({
  date_from: dateFilter('Data inicial'),
  date_to: dateFilter('Data final'),
});

export type TicketSummaryFilters = z.infer<typeof ticketSummarySchema>;
