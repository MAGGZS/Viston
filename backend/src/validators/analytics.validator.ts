import { MaintenanceCategory } from '@prisma/client';
import { z } from 'zod';

/**
 * O que o painel analítico aceita perguntar.
 *
 * O recorte é por mês e ano, e não por par de datas soltas como na listagem:
 * a tela troca o período por dois seletores, e um intervalo livre permitiria
 * comparações com o "período anterior" que não querem dizer nada — comparar
 * dezoito dias de março com os dezoito anteriores não é comparar nada.
 *
 * `month` ausente significa o ano inteiro. É o mesmo "até hoje" dos cartões do
 * painel inicial, e serve à leitura de tendência.
 */
export const analyticsFiltersSchema = z.object({
  year: z.coerce
    .number({ invalid_type_error: 'Ano inválido' })
    .int('Ano inválido')
    .min(2000, 'Ano inválido')
    .max(2100, 'Ano inválido')
    .optional(),

  month: z.coerce
    .number({ invalid_type_error: 'Mês inválido' })
    .int('Mês inválido')
    .min(1, 'Mês inválido')
    .max(12, 'Mês inválido')
    .optional(),

  /** Um responsável do prédio. Conferido contra o vínculo antes de virar filtro. */
  responsible_id: z.string().uuid('Responsável inválido').optional(),

  floor_id: z.string().uuid('Andar inválido').optional(),

  category: z
    .nativeEnum(MaintenanceCategory, { errorMap: () => ({ message: 'Categoria inválida' }) })
    .optional(),
});

export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;
