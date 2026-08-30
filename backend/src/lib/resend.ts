import { Resend } from 'resend';
import { config } from '../config';

/**
 * O cliente do Resend, único ponto do sistema que toca a chave.
 *
 * Preguiçoso de propósito: `new Resend()` com chave vazia não reclama na hora,
 * reclama no envio, e em desenvolvimento nem chega lá — `hasEmailProvider`
 * desvia antes. Instanciar no import faria o backend local exigir uma conta
 * Resend só para subir.
 */
let client: Resend | null = null;

export function hasEmailProvider(): boolean {
  return Boolean(config.email.resendApiKey);
}

export function resend(): Resend {
  if (!client) client = new Resend(config.email.resendApiKey);
  return client;
}
