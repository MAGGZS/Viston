// Roda no navegador antes de o app ficar interativo (convenção do Next).
// Erros que escapam de tudo chegam ao Sentry pelos handlers globais do SDK.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sentryOptions } from './app/lib/sentry';

if (SENTRY_DSN) {
  Sentry.init(sentryOptions);
}
