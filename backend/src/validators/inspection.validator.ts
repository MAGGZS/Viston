import { z } from 'zod';
import { MaintenanceCategory, MaintenanceType, Priority } from '@prisma/client';

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

// Tipos escritos à mão: com "strict": false no tsconfig, a inferência do zod
// marca todo campo como opcional. Aqui o contrato precisa ser explícito.
export type MaintenanceRecordPayload = {
  maintenance_type: MaintenanceType;
  category: MaintenanceCategory;
  priority: Priority;
  description: string;
  responsible_id?: string | null;
};

// ── Envio único: toda a vistoria chega de uma vez ─────────────────────────────
export const submitInspectionSchema = z.object({
  building_id: z.string().uuid('building_id deve ser um UUID válido'),
  floors: z
    .array(
      z.object({
        floor_id: z.string().uuid(),
        records: z
          .array(maintenanceRecordSchema)
          .max(20, 'Máximo de 20 ocorrências por andar')
          .default([]),
      })
    )
    .min(1, 'Selecione ao menos um andar')
    .max(20, 'Máximo de 20 andares'),
});

// Tipo escrito à mão: a inferência aninhada do zod perde os campos obrigatórios aqui.
export type SubmitInspectionPayload = {
  building_id: string;
  floors: Array<{ floor_id: string; records: MaintenanceRecordPayload[] }>;
};

// ── Filtros de histórico ──────────────────────────────────────────────────────
export const inspectionFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']).optional(),
  inspector_id: z.string().uuid().optional(),
  floor_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// ── Filtros de calendário ─────────────────────────────────────────────────────
export const calendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  range: z.enum(['semestral', 'anual']).optional(),
});
