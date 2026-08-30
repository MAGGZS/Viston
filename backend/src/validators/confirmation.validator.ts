import { z } from 'zod';

/**
 * O token vem cru da query string do link.
 *
 * `base64url` de 32 bytes dá 43 caracteres, mas o schema não fixa o tamanho: um
 * token de formato errado tem de morrer no `TOKEN_INVALIDO` como qualquer
 * outro, e não num 400 de validação que diria "o formato certo não é esse".
 */
export const confirmEmailSchema = z
  .object({
    token: z.string().min(1, 'Token obrigatório').max(500),
  })
  .strict();

/**
 * Reenvio exige a senha.
 *
 * Sem ela, o endpoint vira um botão para disparar e-mail em nome de qualquer
 * endereço cadastrado, de graça e à vontade — o teto por hora limitaria o
 * estrago, não o impediria.
 */
export const resendConfirmationSchema = z
  .object({
    email: z.string().trim().email('E-mail inválido').max(160),
    password: z.string().min(1, 'Senha obrigatória').max(200),
  })
  .strict();
