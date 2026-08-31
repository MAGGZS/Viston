import { Resend } from 'resend';
import { config } from '../config';

/**
 * O cliente do Resend, único ponto do sistema que toca a chave.
 *
 * Preguiçoso porque `new Resend()` no import ligaria a carga deste módulo à
 * ordem de carga do `config` — e o erro daí sai como um `undefined` obscuro em
 * vez do "variável de ambiente obrigatória não definida" que o `config` já
 * sabe dar. Não há mais um modo sem provedor: a chave é obrigatória em toda
 * parte, e quando falta o servidor não sobe.
 */
let client: Resend | null = null;

export function resend(): Resend {
  if (!client) client = new Resend(config.email.resendApiKey);
  return client;
}
