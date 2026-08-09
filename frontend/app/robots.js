import { PRIVATE_ROUTE_PREFIXES, SITE_URL } from '@/app/lib/site';

/**
 * O Viston é um sistema fechado: só a home, o login e o cadastro fazem sentido
 * em buscador. Todo o resto exige sessão e fica bloqueado — inclusive para os
 * rastreadores de IA, que são listados à parte porque ignoram wildcards de
 * forma diferente do Googlebot.
 */
const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'CCBot', 'Google-Extended'];

export default function robots() {
  const disallow = PRIVATE_ROUTE_PREFIXES.map((prefix) => `${prefix}/`);

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
