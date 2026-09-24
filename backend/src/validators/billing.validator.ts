import { z } from 'zod';

/**
 * O que o gestor escolhe para assinar.
 *
 * Só ESSENCIAL e PRO: o LIVRE é onde a conta já está, e "comprar o grátis" não
 * é uma compra — seria uma sessão de pagamento de zero real no Stripe.
 *
 * `extra_buildings` tem teto de 20 aqui e o teto do plano no serviço. Os dois
 * existem: este impede o número absurdo antes de qualquer consulta, e o de lá
 * impede vender ao ESSENCIAL um extra que só o PRO comporta.
 */
export const checkoutSchema = z
  .object({
    plan: z.enum(['ESSENCIAL', 'PRO'], {
      required_error: 'Escolha o plano',
      invalid_type_error: 'Plano deve ser ESSENCIAL ou PRO',
    }),
    interval: z.enum(['MONTHLY', 'YEARLY'], {
      required_error: 'Escolha entre mensal e anual',
    }),
    extra_buildings: z
      .number()
      .int('Prédios extras é um número inteiro')
      .min(0)
      .max(20, 'O máximo de prédios extras é 20')
      .optional(),
  })
  .strict();
