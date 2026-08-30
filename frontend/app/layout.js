import './globals.css';
import localFont from 'next/font/local';
import { QueryProvider } from '@/app/lib/QueryProvider';
import { AuthProvider } from '@/app/lib/AuthProvider';
import { Toast } from '@/app/components/Toast';
import { UnsavedGuard } from '@/app/components/UnsavedGuard';
import { BRAND, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/app/lib/site';
import { THEME_COLOR, THEME_KEY } from '@/app/lib/theme';

/**
 * Uma família para o produto inteiro. Os quatro pesos carregam a hierarquia:
 * 900 é exclusivo do wordmark, 600 titula, 500 é ação e 400 é corpo.
 * Os arquivos vivem no repositório: o build não depende do Google Fonts.
 */
const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-latin-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'vistoria predial',
    'inspeção predial',
    'manutenção predial',
    'relatório de vistoria',
    'gestão de facilities',
    'checklist de andares',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'business',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Sistema fechado: a home pode ser indexada, o conteúdo interno nunca.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport = {
  // Valor de quem chega. Quem já escolheu tem a barra acertada pelo script
  // abaixo, no carregamento, e pelo setTheme de app/lib/tema.js na troca.
  themeColor: BRAND.background,
  width: 'device-width',
  initialScale: 1,
  // A vistoria é preenchida no celular: pinçar para ler uma descrição longa
  // precisa continuar funcionando.
  maximumScale: 5,
  viewportFit: 'cover',
};

/**
 * Escreve o tema no `<html>` antes da primeira pintura.
 *
 * Sem isto a página nasce escura e vira clara depois da hidratação, e o piscar
 * é justamente o que se vê primeiro. Fica em `<script>` no começo do `<body>`
 * porque o navegador o executa enquanto ainda está montando a página, antes de
 * pintar qualquer coisa. Escuro é o padrão de quem chega: é a cara do produto,
 * e a maioria dos telefones está em claro por conta do sistema.
 *
 * Acerta também a barra do sistema no telefone. O `themeColor` do viewport é um
 * valor só, escrito no HTML, e sem esta linha quem escolheu o claro voltaria a
 * cada carregamento com o app claro e a barra preta em cima. O `<meta>` está no
 * `<head>`, que o navegador já leu quando chega aqui.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');t=(t==='light'||t==='dark')?t:'dark';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',${JSON.stringify(THEME_COLOR)}[t]);}catch(e){document.documentElement.dataset.theme='dark'}})();`;

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning`: o script acima muda um atributo do `<html>`
    // antes da hidratação, e sem isso o React reclama da diferença que ele
    // mesmo deve encontrar.
    <html lang="pt-BR" className={poppins.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/*
          Primeira parada do Tab em qualquer tela.

          Sem ele, quem navega por teclado atravessa a barra lateral inteira —
          ou a de baixo — antes de chegar ao que veio ler, em toda troca de
          página. Fica invisível até receber foco (ver `.skip-link`), e aterrissa
          no `<main>` de cada tela.
        */}
        <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
        <QueryProvider>
          <AuthProvider>
            <Toast />
            {/* Pergunta antes de tirar alguém de um formulário mexido — o
                registro de quem está pendente é global (ver store/unsaved.js). */}
            <UnsavedGuard />
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
