import * as Sentry from '@sentry/node';
import { config } from '../config';

/**
 * Alerta de erro do backend, pelo Sentry (plano grátis).
 *
 * O log do Render mostra o 500 para quem estiver olhando; o Sentry avisa quem
 * não está. Sem `SENTRY_DSN` nada é iniciado e `captureException` vira no-op —
 * é o estado da máquina de quem desenvolve e dos testes.
 *
 * Só erros, sem tracing: a cota do plano grátis é pequena, e desempenho já se
 * mede pelo log de requisição.
 *
 * O que sai daqui vai para um serviço de fora, então sai o mínimo. O corpo do
 * login tem senha em claro, o `Authorization` tem o token e as variáveis locais
 * de um stack frame podem ter qualquer um dos dois. Nada disso é coletado, e o
 * `beforeSend` apaga de novo o que alguma integração tenha posto no evento.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || config.nodeEnv,
    // O Render expõe o commit do deploy: é o que diz se o erro é do código novo.
    release: process.env.RENDER_GIT_COMMIT,
    tracesSampleRate: undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
}

/**
 * Manda o erro ao Sentry com o id da requisição, que liga o alerta à linha do
 * log do Render.
 */
export function reportError(err: unknown, reqId?: string): void {
  if (!Sentry.isInitialized()) return;
  Sentry.withScope((scope) => {
    if (reqId) scope.setTag('req_id', reqId);
    Sentry.captureException(err);
  });
}

/** Espera o envio dos eventos pendentes, antes de o processo sair. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!Sentry.isInitialized()) return;
  await Sentry.flush(timeoutMs);
}
