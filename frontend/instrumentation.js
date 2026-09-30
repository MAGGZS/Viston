// Instrumentação do servidor do Next (convenção do Next).
// Quase tudo aqui é client component, mas o que quebrar na renderização do
// servidor, e em sitemap, robots e imagens geradas, também deve avisar.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sentryOptions } from './app/lib/sentry';

export function register() {
  if (SENTRY_DSN) Sentry.init(sentryOptions);
}

export async function onRequestError(...args) {
  if (SENTRY_DSN) await Sentry.captureRequestError(...args);
}
