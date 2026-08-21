/**
 * Dados fixos do site, usados por metadata, sitemap, robots e manifest.
 *
 * A URL pública vem de NEXT_PUBLIC_SITE_URL (defina na Vercel). O fallback é o
 * domínio de produção de verdade — ele entra em canonical, sitemap e Open
 * Graph, e apontar para um domínio que não existe manda buscador e prévia de
 * link para lugar nenhum.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://viston-nine.vercel.app').replace(/\/$/, '');

export const SITE_NAME = 'Viston';
export const SITE_TITLE = 'Viston — Sistema de Vistoria Predial';
export const SITE_DESCRIPTION =
  'Viston organiza a vistoria predial de ponta a ponta: registro de ocorrências por andar, ' +
  'histórico com calendário e planilha do relatório gerada automaticamente.';

/** Cores da identidade — repetidas em manifest, theme-color e nas imagens geradas. */
export const BRAND = {
  background: '#0B0B0B',
  accent: '#F5C518',
  foreground: '#FFFFFF',
};

/**
 * Rotas abertas (aparecem no sitemap e podem ser indexadas).
 * Tudo o que exige login fica de fora e é bloqueado no robots.txt.
 */
export const PUBLIC_ROUTES = ['/', '/login', '/register', '/register/gestor'];

/** Prefixos que só existem depois do login — nada aqui deve ir para buscador. */
export const PRIVATE_ROUTE_PREFIXES = [
  '/home',
  '/inspecao',
  '/historico',
  '/perfil',
  '/desktop',
  '/gestor',
  '/moderador',
  '/responsavel',
];
