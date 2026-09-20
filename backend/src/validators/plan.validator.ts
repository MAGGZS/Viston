import { z } from 'zod';

/**
 * A concessão que o admin abre para uma conta.
 *
 * `reason` é obrigatório de propósito — a coluna no banco também é. Concessão
 * sem motivo escrito é a que ninguém consegue explicar seis meses depois, e o
 * custo de escrever uma linha agora é menor que o de adivinhar depois.
 *
 * `days` ausente é concessão sem prazo, e é uma decisão, não um esquecimento:
 * quem concede tem de dizer o prazo ou dizer que não há. O teto de 3650 dias
 * existe para que um dedo escorregado não conceda até 5124.
 */
export const grantPlanSchema = z
  .object({
    plan: z.enum(['LIVRE', 'ESSENCIAL', 'PRO'], {
      required_error: 'Informe o plano',
      invalid_type_error: 'Plano deve ser LIVRE, ESSENCIAL ou PRO',
    }),
    reason: z
      .string()
      .trim()
      .min(3, 'Escreva o motivo da concessão')
      .max(300, 'O motivo deve ter no máximo 300 caracteres'),
    days: z
      .number()
      .int('O prazo é em dias inteiros')
      .positive('O prazo precisa ser de ao menos um dia')
      .max(3650, 'O prazo máximo é de 3650 dias')
      .optional(),
  })
  .strict();

/** Suspender é `true`, devolver a conta é `false`. Sem meio-termo e sem toggle. */
export const suspensionSchema = z
  .object({
    suspended: z.boolean({ required_error: 'Informe se a conta fica suspensa' }),
  })
  .strict();

/** Mesma forma da suspensão, e pela mesma razão: o estado vai explícito. */
export const freezeSchema = z
  .object({
    frozen: z.boolean({ required_error: 'Informe se o prédio fica inativo' }),
  })
  .strict();
