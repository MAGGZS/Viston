import { PUBLIC_ROUTES, SITE_URL } from '@/app/lib/site';

/**
 * Só as rotas abertas entram. As telas do sistema exigem login — indexá-las
 * geraria resultados que levam direto para um redirect.
 */
const PRIORITY = { '/': 1, '/login': 0.6, '/register': 0.6 };

export default function sitemap() {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map((route) => ({
    // A raiz sai com a barra final para bater com o canonical da metadata.
    url: `${SITE_URL}${route}`,
    lastModified,
    changeFrequency: route === '/' ? 'monthly' : 'yearly',
    priority: PRIORITY[route] ?? 0.5,
  }));
}
