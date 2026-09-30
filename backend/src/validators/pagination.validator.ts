import { z } from 'zod';

/**
 * Página e tamanho de página das listagens do admin.
 *
 * Antes cada controller lia os dois com `parseInt` à mão: `?page=abc` virava
 * `NaN` no `skip` do Prisma (500), e `?limit=100000` trazia a tabela inteira
 * numa resposta só. Aqui o texto inválido vira 400 e o tamanho tem teto.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
