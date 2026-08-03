import { z } from 'zod';

// ── Itens com has_item + sub-campos ──────────────────────────────────────────
const itemWithSubForm = z
  .object({
    has_item: z.boolean({ required_error: 'has_item é obrigatório para este item' }),
    quantity: z.number().int().nonnegative().optional(),
    is_marked: z.boolean().optional(),
    // Rejeitar campos de status em itens com sub-form
    status: z.undefined({
      invalid_type_error: 'status não é aplicável a este item',
    }).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.has_item === true) {
      if (val.quantity === undefined) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'quantity é obrigatório quando has_item = true' });
      }
      if (val.is_marked === undefined) {
        ctx.addIssue({ code: 'custom', path: ['is_marked'], message: 'is_marked é obrigatório quando has_item = true' });
      }
    } else {
      // has_item = false: não deve ter quantity/is_marked
      if (val.quantity !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'quantity não deve ser informado quando has_item = false' });
      }
      if (val.is_marked !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['is_marked'], message: 'is_marked não deve ser informado quando has_item = false' });
      }
    }
  });

// ── Itens sem sub-form (só status) ───────────────────────────────────────────
const itemWithStatus = z
  .object({
    status: z.enum(['OK', 'NOK', 'NA'], { required_error: 'status é obrigatório para este item' }),
    // Rejeitar campos de sub-form em itens de status
    has_item: z.undefined({ invalid_type_error: 'has_item não é aplicável a este item' }).optional(),
    quantity: z.undefined({ invalid_type_error: 'quantity não é aplicável a este item' }).optional(),
    is_marked: z.undefined({ invalid_type_error: 'is_marked não é aplicável a este item' }).optional(),
  });

// ── Payload completo do andar ─────────────────────────────────────────────────
export const floorFormSchema = z.object({
  status_geral: z.enum(['OK', 'ATENCAO', 'PROBLEMA']),
  observations: z.array(z.string()).default([]),
  manutencao: z.object({
    cadeiras: itemWithSubForm,
    tomadas: itemWithSubForm,
    ar_condicionado: itemWithStatus,
    mesas: itemWithSubForm,
    portas: itemWithStatus,
  }),
  limpeza: z.object({
    carpete: itemWithStatus,
    vidros: itemWithStatus,
    cadeiras: itemWithSubForm,
  }),
});

export type FloorFormPayload = z.infer<typeof floorFormSchema>;

// ── Iniciar inspeção ──────────────────────────────────────────────────────────
export const startInspectionSchema = z.object({
  building_id: z.string().uuid('building_id deve ser um UUID válido'),
  floor_ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos um andar')
    .max(12, 'Máximo de 12 andares'),
});

// ── Filtros de histórico ──────────────────────────────────────────────────────
export const inspectionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']).optional(),
  inspector_id: z.string().uuid().optional(),
  floor_id: z.string().uuid().optional(),
  google_form_synced: z.coerce.boolean().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// ── Filtros de calendário ─────────────────────────────────────────────────────
export const calendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  range: z.enum(['semestral', 'anual']).optional(),
});
