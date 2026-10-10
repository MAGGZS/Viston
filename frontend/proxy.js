import { NextResponse } from 'next/server';
import { sentryOrigin } from './app/lib/sentry.js';

/**
 * De onde a API pode ser chamada.
 *
 * O `connect-src` precisa listar o backend explicitamente: `'self'` cobre só o
 * próprio domínio, e a API mora em outro. A variável manda; sem ela, o Render
 * conhecido entra no lugar — a alternativa seria uma diretiva vazia, que
 * bloqueia o app inteiro em produção.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'https://viston.onrender.com';

/**
 * O backend rodando na máquina, que `app/lib/api.js` escolhe sozinho quando a
 * página é servida de localhost. Sem ele no `connect-src`, o navegador barra a
 * chamada antes de sair — o login local falha com a API no ar e o backend sem
 * receber requisição nenhuma, que é o pior lugar para começar a procurar.
 *
 * Entra só em desenvolvimento: em produção a origem não existe, e listá-la
 * abriria o app a um servidor local qualquer.
 */
const LOCAL_API_ORIGIN = 'http://localhost:4000';

/**
 * Para onde o Sentry manda os erros do navegador. Vazio quando não há DSN: aí
 * nada é enviado e o `connect-src` fica como estava.
 */
const SENTRY_ORIGIN = sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN || '');

/**
 * A origem exata do Storage deste projeto, para o `media-src`.
 *
 * Só o projeto do Viston, e não qualquer `*.supabase.co`: um `<video>` ou uma
 * `<track>` injetados não tocam mídia de um projeto alheio. Sem a variável (ou
 * com ela malformada), vale o curinga do Supabase, que é o que as outras
 * diretivas usam: a alternativa seria barrar o player inteiro em silêncio.
 */
function supabaseOrigin(url) {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? origin : null;
  } catch {
    return null;
  }
}
const MEDIA_ORIGIN = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL || '') || 'https://*.supabase.co';

/**
 * CSP do navegador, com nonce novo a cada requisição.
 *
 * O `helmet` do backend protege a API, que só devolve JSON. O que faltava era
 * isto: o CSP do *navegador*, que é onde o token vive. Enquanto o access e o
 * refresh token ficarem em `localStorage`, um único script injetado os lê — e é
 * o CSP que decide se um script de fora chega a rodar.
 *
 * Nonce e não hash (SEC-09): o App Router escreve scripts inline próprios em
 * toda página — o payload do RSC, `self.__next_f.push(...)` —, e o conteúdo
 * muda de página para página. Um hash fixo só cobria o script do tema, e o
 * resto era barrado: a hidratação morria com o React #412. O Next lê o nonce
 * deste cabeçalho na requisição e o aplica sozinho nos scripts dele; o do tema
 * recebe o mesmo em `app/layout.js`. `'strict-dynamic'` deixa os chunks que
 * esses scripts carregam rodarem sem listar cada um.
 *
 * O preço é render dinâmico em toda página: HTML estático não tem requisição de
 * onde tirar o nonce.
 *
 * `'unsafe-inline'` no `style-src` não é escolha: o Next injeta estilos inline
 * nas páginas e o styled-jsx depende disso.
 */
function buildCsp(nonce) {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    // `'unsafe-eval'` só em desenvolvimento: o refresh rápido do Next precisa dele.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Avatar e planilha vêm do Storage do Supabase; `data:` é o recorte no canvas.
    "img-src 'self' https://*.supabase.co data: blob:",
    "font-src 'self' data:",
    // O vídeo e a legenda dos tutoriais (app/ajuda) vêm do Storage por URL
    // assinada. Sem `media-src`, o `default-src 'self'` barra o `<video>` e a
    // `<track>`: o player abre com a capa e nunca toca, sem erro à vista. A
    // capa (`poster`) é imagem, e passa pelo `img-src` acima. Sem `blob:`: o
    // player toca a URL do Storage direto, nunca um objeto montado na página.
    `media-src 'self' ${MEDIA_ORIGIN}`,
    `connect-src 'self' ${API_ORIGIN}${isDev ? ` ${LOCAL_API_ORIGIN}` : ''} https://*.supabase.co ${SENTRY_ORIGIN}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Arquivo estático e prefetch do `next/link` não precisam de CSP próprio.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2|txt|xml|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
