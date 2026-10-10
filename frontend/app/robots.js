import { PRIVATE_ROUTE_PREFIXES, SITE_URL } from '@/app/lib/site';

/**
 * O Viston é um sistema fechado: só a home, o login e o cadastro fazem sentido
 * em buscador. Todo o resto exige sessão e fica bloqueado, inclusive para os
 * rastreadores de IA, que são listados à parte porque ignoram wildcards de
 * forma diferente do Googlebot.
 */
const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'CCBot', 'Google-Extended'];

/**
 * Cada prefixo privado vira duas regras: `/ajuda$` (a rota exata) e `/ajuda/`
 * (as subrotas). Só `/ajuda/` deixava a própria `/ajuda` livre. E `Disallow:
 * /ajuda` sozinho casa por texto, então bloquearia também uma rota pública
 * futura como `/ajudante`. O `$` (fim do caminho) faz parte do padrão de
 * robots.txt (RFC 9309) e é respeitado por Google e Bing; um rastreador que
 * não o entenda apenas ignora essa linha e continua barrado nas subrotas.
 */
function regrasDeBloqueio(prefixos = PRIVATE_ROUTE_PREFIXES) {
  return prefixos.flatMap((prefix) => [`${prefix}$`, `${prefix}/`]);
}

export default function robots() {
  const disallow = regrasDeBloqueio();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...disallow, '/api/'],
      },
      {
        userAgent: AI_CRAWLERS,
        allow: ['/', '/llms.txt'],
        disallow,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
