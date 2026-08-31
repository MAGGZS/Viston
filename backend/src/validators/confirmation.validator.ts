import { z } from 'zod';

/**
 * Seis dígitos, e só dígitos.
 *
 * O `regex` recusa "12 34 56" e "abc123" antes de qualquer ida ao banco — mas
 * não é validação de segurança: código de formato certo e valor errado morre
 * igual, no `CODIGO_INVALIDO`, e é lá que o contador de tentativas mora.
 */
const codigo = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'O código tem 6 dígitos');

const email = z.string().trim().email('E-mail inválido').max(160);

/**
 * A senha nova, com o mesmo piso do cadastro.
 *
 * Oito caracteres e nada de regra de maiúscula, número e símbolo: exigência de
 * composição empurra as pessoas para `Senha@123` e para o papel colado no
 * monitor. Comprimento é o que realmente pesa, e o bcrypt cuida do resto.
 */
const senha = z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(200);

export const confirmEmailSchema = z.object({ email, code: codigo }).strict();

/**
 * Reenvio exige a senha.
 *
 * Sem ela, o endpoint vira um botão para disparar e-mail em nome de qualquer
 * endereço cadastrado — o teto por hora limitaria o volume, não o incômodo.
 */
export const resendConfirmationSchema = z
  .object({ email, password: z.string().min(1, 'Senha obrigatória').max(200) })
  .strict();

export const forgotPasswordSchema = z.object({ email }).strict();

export const verifyResetCodeSchema = z.object({ email, code: codigo }).strict();

export const resetPasswordSchema = z
  .object({ email, code: codigo, new_password: senha })
  .strict();
