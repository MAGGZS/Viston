import { z } from 'zod';

/**
 * A quem o prédio é oferecido.
 *
 * Só o id: o resto — se a pessoa é co-gestora, se a conta está suspensa — é
 * conferido no serviço, contra o banco. Um e-mail aqui faria a rota virar um
 * verificador de quem tem conta, que é o que o resto do produto evita.
 */
export const requestTransferSchema = z
  .object({
    to_manager_id: z.string().uuid('Indique um gestor do prédio'),
  })
  .strict();

/** Aceitar ou recusar, explícito. Silêncio tem outro caminho: o prazo. */
export const respondTransferSchema = z
  .object({
    accept: z.boolean({ required_error: 'Diga se aceita o prédio' }),
  })
  .strict();
