import { z } from 'zod';

// ── Ocorrência relatada em um andar ──────────────────────────────────────────
export const maintenanceRecordSchema = z.object({
  maintenance_type: z.enum(
    [
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
    ],
    { required_error: 'Tipo de manutenção é obrigatório' }
  ),
  category: z.enum(['PREVENTIVA', 'CORRETIVA', 'EMERGENCIAL', 'EVENTOS', 'PROJETOS'], {
    required_error: 'Categoria é obrigatória',
  }),
  priority: z.enum(['ALTA', 'MEDIA', 'BAIXA'], { required_error: 'Prioridade é obrigatória' }),
  description: z.string().trim().min(1, 'Descrição é obrigatória').max(2000),
  // Opcional, e nulo é um estado normal: o inspetor sugere a quem aquilo cabe
  // entre os responsáveis daquele prédio, mas quem não souber deixa em branco e
  // o chamado chega ao moderador sem dono — que é a fila dele.
  //
  // O status não vem mais do formulário: a ocorrência nasce ABERTA e o resto do
  // caminho é do moderador e do responsável.
  responsible_id: z.string().uuid('Responsável inválido').optional().nullable(),
});

// Inferido, e não escrito à mão. A cópia manual existia porque, com
// `strict: false`, a inferência do zod marcava todo campo como opcional — o
// projeto mantinha duas versões do mesmo contrato, e nada garantia que
// continuassem iguais. Com `strict` ligado, o schema é a única fonte.
export type MaintenanceRecordPayload = z.infer<typeof maintenanceRecordSchema>;

// ── Envio único: toda a vistoria chega de uma vez ─────────────────────────────
//
// `.strict()` como os demais: campo fora do contrato faz o envio falhar em vez
// de ser descartado em silêncio. A chave da tentativa de envio não entra aqui —
// ela viaja no cabeçalho `Idempotency-Key`, não no corpo.
export const submitInspectionSchema = z
  .object({
    building_id: z.string().uuid('building_id deve ser um UUID válido'),
    floors: z
      .array(
        z
          .object({
            floor_id: z.string().uuid(),
            records: z
              .array(maintenanceRecordSchema)
              .max(20, 'Máximo de 20 ocorrências por andar')
              .default([]),
          })
          .strict()
      )
      .min(1, 'Selecione ao menos um andar')
      .max(20, 'Máximo de 20 andares'),
  })
  .strict();

export type SubmitInspectionPayload = z.infer<typeof submitInspectionSchema>;

/**
 * Data de filtro vinda da querystring.
 *
 * `errorMap` e não `invalid_type_error`: a data coagida falha com o código
 * `invalid_date`, que o `invalid_type_error` não alcança — a mensagem sairia em
 * inglês, do zod, no meio de uma API que responde em português.
 */
const dateFilter = (label: string) =>
  z.coerce.date({ errorMap: () => ({ message: `${label} inválida` }) }).optional();

// ── Filtros de histórico ──────────────────────────────────────────────────────
export const inspectionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']).optional(),
  inspector_id: z.string().uuid().optional(),
  floor_id: z.string().uuid().optional(),
  // `coerce.date` e não `string`: com string, `?date_from=abc` virava
  // `new Date('abc')` lá no repositório, o Prisma recusava a data inválida e a
  // resposta era 500 — erro do servidor para um filtro que o usuário digitou.
  // Aqui o mesmo pedido é 400, com a mensagem no campo certo.
  date_from: dateFilter('Data inicial'),
  date_to: dateFilter('Data final'),
});

// ── Filtros de calendário ─────────────────────────────────────────────────────
export const calendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  range: z.enum(['semestral', 'anual']).optional(),
});
