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
 * Cabeçalhos de segurança do app.
 *
 * O `helmet` do backend protege a API, que só devolve JSON. O que faltava era
 * isto: o CSP do *navegador*, que é onde o token vive. Enquanto o access e o
 * refresh token ficarem em `localStorage`, um único script injetado os lê — e é
 * o CSP que decide se um script de fora chega a rodar.
 *
 * `'unsafe-inline'` no `style-src` não é escolha: o Next injeta estilos inline
 * nas páginas e o styled-jsx depende disso. Em `script-src` ele não aparece.
 */
const csp = [
  "default-src 'self'",
  // `'unsafe-eval'` só em desenvolvimento: o refresh rápido do Next precisa dele.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Avatar e planilha vêm do Storage do Supabase; `data:` é o recorte no canvas.
  "img-src 'self' https://*.supabase.co data: blob:",
  "font-src 'self' data:",
  process.env.NODE_ENV === 'development'
    ? `connect-src 'self' ${API_ORIGIN} ${LOCAL_API_ORIGIN} https://*.supabase.co`
    : `connect-src 'self' ${API_ORIGIN} https://*.supabase.co`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Nada disto é usado pelo app; negar de saída evita que um script
          // injetado peça em nome dele.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
