/**
 * Configuração do Sentry (plano grátis), comum ao navegador e ao servidor.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` vazio desliga tudo: nada é iniciado e nada sai. É o
 * estado da máquina de quem desenvolve, dos testes e dos previews sem a variável.
 * O `NEXT_PUBLIC_` é obrigatório: o valor precisa estar no bundle do navegador,
 * e o DSN não é segredo, só diz para onde mandar.
 *
 * Só erros, sem tracing nem replay: a cota do plano grátis é pequena.
 *
 * O token vive no `localStorage` e a chave de convite de prédio anda na URL.
 * Nenhum dos dois pode acabar num serviço de fora, então query string, cabeçalho,
 * corpo e breadcrumb de console ficam de fora do evento.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

/** Origem de envio do Sentry, para o `connect-src` do CSP. */
export function sentryOrigin(dsn = SENTRY_DSN) {
  if (!dsn) return '';
  try {
    return new URL(dsn).origin;
  } catch {
    return '';
  }
}

export const sentryOptions = {
  dsn: SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // A Vercel expõe o commit do deploy: é o que diz se o erro é do código novo.
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
  tracesSampleRate: undefined,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
  },
  beforeBreadcrumb(breadcrumb) {
    // `console.log` de depuração pode ter qualquer coisa, inclusive resposta da API.
    if (breadcrumb.category === 'console') return null;
    return breadcrumb;
  },
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.query_string;
      if (event.request.url) event.request.url = event.request.url.split('?')[0];
    }
    delete event.user;
    return event;
  },
};
