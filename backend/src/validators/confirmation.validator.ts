import { z } from 'zod';
import { mensagemSenhaFraca, regrasFaltando } from '../utils/senhaForte';

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
 * A senha, com as quatro exigências de composição — ver `utils/senhaForte`.
 *
 * O `max(200)` vem antes do `refine` de propósito: bcrypt só olha os primeiros
 * 72 bytes, e um campo sem teto deixaria alguém mandar um megabyte para o hash
 * mastigar a cada tentativa de login.
 *
 * A mensagem diz *o que faltou*, e não "senha fraca": a tela mostra a lista,
 * mas a API responde a mais gente que a tela.
 */
export const senhaSchema = z
  .string()
  .max(200, 'A senha é longa demais')
  .refine((v) => regrasFaltando(v).length === 0, (v) => ({ message: mensagemSenhaFraca(v) }));

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
  .object({ email, code: codigo, new_password: senhaSchema })
  .strict();
