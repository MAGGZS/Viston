import { z } from 'zod';

/**
 * Os contratos de entrada da central de ajuda. O de saída está em
 * `tutoriais/API.md`.
 *
 * Todos `.strict()` nas rotas do admin, como os outros schemas de escrita: um
 * campo a mais no corpo (ex.: `published` no PATCH da funcionalidade) é erro
 * de quem chamou, e engolir em silêncio esconderia o erro.
 */

/** O slug de pasta e de funcionalidade: o mesmo formato do `id` do roteiro. */
export const HELP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const searchQuerySchema = z.object({
  q: z
    .string({ required_error: 'Digite o que você procura' })
    .trim()
    .min(2, 'Digite ao menos 2 letras')
    .max(100, 'A busca deve ter no máximo 100 caracteres'),
});

export const helpfulSchema = z
  .object({
    helpful: z.boolean({ required_error: 'Responda sim ou não', invalid_type_error: 'Responda sim ou não' }),
    comment: z.string().trim().max(2000, 'O comentário deve ter no máximo 2000 caracteres').optional(),
  })
  .strict();

const title = z.string().trim().min(1, 'O título não pode ficar vazio').max(120, 'O título deve ter no máximo 120 caracteres');

export const updateFolderSchema = z
  .object({
    title: title.optional(),
    description: z.string().trim().min(1, 'A descrição não pode ficar vazia').max(300, 'A descrição deve ter no máximo 300 caracteres').optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Informe o que mudar');

export const updateFeatureSchema = z
  .object({
    title: title.optional(),
    // Vazio vira nulo: apagar o resumo é uma escolha válida.
    summary: z
      .string()
      .trim()
      .max(300, 'O resumo deve ter no máximo 300 caracteres')
      .transform((s) => (s === '' ? null : s))
      .nullable()
      .optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Informe o que mudar');

export const updateStepSchema = z
  .object({
    title: title.optional(),
    body: z.string().trim().min(1, 'O texto da aba não pode ficar vazio').max(2000, 'O texto da aba deve ter no máximo 2000 caracteres').optional(),
    // Segundos com até três casas, como o player devolve. Nulo apaga o tempo.
    // `.finite()` porque `1e400` no JSON chega como `Infinity`, e o zod aceita.
    start_s: z
      .number({ invalid_type_error: 'O tempo de início precisa ser um número de segundos' })
      .finite('O tempo de início precisa ser um número de segundos')
      .min(0, 'O tempo de início não pode ser negativo')
      .transform((n) => Math.round(n * 1000) / 1000)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Informe o que mudar');

export const reorderSchema = z
  .object({
    ids: z.array(z.string().uuid('Id inválido')).min(1, 'Informe a nova ordem'),
  })
  .strict();

export const commitSchema = z
  .object({
    upload_id: z.string({ required_error: 'Informe o upload_id recebido ao pedir as URLs' }).uuid('upload_id inválido'),
  })
  .strict();

export const syncSchema = z
  .object({
    textos: z.boolean().optional(),
  })
  .strict();

/**
 * Publicar ou despublicar vários de uma vez. O teto de 100 cobre o catálogo
 * inteiro com folga e impede um corpo gigante de virar um `IN` sem fim.
 */
export const publishBatchSchema = z
  .object({
    ids: z
      .array(z.string().uuid('Id inválido'), { required_error: 'Informe os tutoriais', invalid_type_error: 'Informe os tutoriais' })
      .min(1, 'Escolha ao menos um tutorial')
      .max(100, 'No máximo 100 tutoriais por vez')
      .refine((ids) => new Set(ids).size === ids.length, 'Cada tutorial pode aparecer uma vez só'),
    published: z.boolean({ required_error: 'Informe se é para publicar ou despublicar', invalid_type_error: 'Informe se é para publicar ou despublicar' }),
  })
  .strict();
