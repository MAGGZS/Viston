import { BRAND, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '@/app/lib/site';

/**
 * Manifest PWA — o app é usado no celular durante a vistoria, então vale
 * poder instalar na tela de início e abrir em tela cheia.
 */
export default function manifest() {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND.background,
    theme_color: BRAND.background,
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      // Sem cantos arredondados: o Android recorta no formato do próprio sistema
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
