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
      // O maskable é o único que não pode ser transparente: o Android recorta no
      // formato do próprio sistema e preenche o resto, então vai com a placa
      // escura do arquivo e a marca dentro da zona segura.
      { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
