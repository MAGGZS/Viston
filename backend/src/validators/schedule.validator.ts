import { z } from 'zod';
import { ScheduleStatus } from '@prisma/client';

/**
 * Um dia do calendário, como o app manda: `yyyy-MM-dd`.
 *
 * A regex sozinha deixaria passar `2026-02-31`. A volta pelo `Date` confere que
 * o dia existe — o mês de fevereiro com 31 dias viraria 3 de março em silêncio.
 */
export const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato yyyy-MM-dd')
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  }, 'Data inválida')
  // A mesma faixa de anos da query `year`: um ano 9999 passaria pela regex e
  // viraria um recorte absurdo no banco.
  .refine((valor) => {
    const ano = Number(valor.slice(0, 4));
    return ano >= 2000 && ano <= 2100;
  }, 'Ano fora da faixa 2000–2100');

const notasSchema = z.string().trim().max(1000, 'Observação de até 1000 caracteres');

/** Os andares da ronda: ao menos um, sem repetir (a repetição é descartada no serviço). */
const andaresSchema = z.array(z.string().uuid()).min(1, 'Escolha ao menos um andar').max(500);

/**
 * Marcar uma ronda.
 *
 * `.strict()` como no resto da API: o que não está no contrato é recusado, em
 * vez de ignorado — `status` ou `completed_report_id` no corpo do POST não
 * entram por engano.
 */
export const createScheduleSchema = z
  .object({
    inspector_id: z.string().uuid(),
    scheduled_date: diaSchema,
    due_date: diaSchema,
    floor_ids: andaresSchema,
    notes: notasSchema.nullish(),
  })
  .strict()
  // Comparar `yyyy-MM-dd` como texto é comparar a data: o formato ordena.
  .refine((b) => b.due_date >= b.scheduled_date, {
    message: 'O prazo não pode ser antes da data agendada',
    path: ['due_date'],
  });

export type CreateSchedulePayload = z.infer<typeof createScheduleSchema>;

/**
 * Mexer numa ronda: qualquer subconjunto dos campos, e o status.
 *
 * As datas só são comparadas aqui quando vêm as duas; quando vem uma só, a
 * outra está no banco, e quem compara é o serviço.
 */
export const updateScheduleSchema = z
  .object({
    inspector_id: z.string().uuid().optional(),
    scheduled_date: diaSchema.optional(),
    due_date: diaSchema.optional(),
    floor_ids: andaresSchema.optional(),
    notes: notasSchema.nullish(),
    status: z.nativeEnum(ScheduleStatus).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nada para alterar' })
  .refine((b) => !b.scheduled_date || !b.due_date || b.due_date >= b.scheduled_date, {
    message: 'O prazo não pode ser antes da data agendada',
    path: ['due_date'],
  });

export type UpdateSchedulePayload = z.infer<typeof updateScheduleSchema>;

/**
 * O recorte da agenda. Sem mês e sem ano, a agenda inteira; só o ano, o ano
 * todo; só o mês, aquele mês do ano corrente.
 */
export const scheduleListQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.nativeEnum(ScheduleStatus).optional(),
  /**
   * `?overdue=true`: os atrasados de qualquer mês — PENDENTE com o dia agendado
   * antes de hoje. Ignora mês, ano e status. Só `true` e `false` valem: o
   * `z.coerce.boolean` leria `"false"` como verdadeiro.
   */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type ScheduleListQuery = z.infer<typeof scheduleListQuerySchema>;

/**
 * A sugestão de inspetor. `floor_ids` vem como lista separada por vírgula na
 * query (`?floor_ids=a,b`), que é o que um `<select multiple>` vira na URL.
 */
export const suggestionQuerySchema = z
  .object({
    floor_ids: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
      .pipe(z.array(z.string().uuid()).max(500)),
    scheduled_date: diaSchema.optional(),
    due_date: diaSchema.optional(),
  })
  .refine((q) => !q.scheduled_date || !q.due_date || q.due_date >= q.scheduled_date, {
    message: 'O prazo não pode ser antes da data agendada',
    path: ['due_date'],
  });

export type SuggestionQuery = z.infer<typeof suggestionQuerySchema>;

/** O período mais longo que o painel aceita: um ano, com folga para o bissexto. */
export const OVERVIEW_MAX_DIAS = 366;

/**
 * O período do painel do supervisor. Sem datas, o mês corrente.
 *
 * Até 366 dias: o painel lê as rondas e os chamados do período inteiro, e um
 * intervalo de décadas viraria uma consulta sem fim.
 */
export const overviewQuerySchema = z
  .object({
    from: diaSchema.optional(),
    to: diaSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, {
    message: 'O fim do período não pode ser antes do início',
    path: ['to'],
  })
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 + 1 <=
        OVERVIEW_MAX_DIAS,
    { message: `O período pode ter no máximo ${OVERVIEW_MAX_DIAS} dias`, path: ['to'] }
  );

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

export const notificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** O sino de um prédio só — a lista e a contagem de não lidas. */
  building_id: z.string().uuid().optional(),
});

/** "Marcar todas como lidas": opcionalmente, só as de um prédio. */
export const readAllNotificationsQuerySchema = z.object({
  building_id: z.string().uuid().optional(),
});

/** A agenda da própria conta: o mês e, opcionalmente, um prédio só e um status. */
export const mySchedulesQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  building_id: z.string().uuid().optional(),
  /** Só um status. CANCELADO não está aqui: a agenda da conta não o mostra. */
  status: z.enum([ScheduleStatus.PENDENTE, ScheduleStatus.CONCLUIDO]).optional(),
});
