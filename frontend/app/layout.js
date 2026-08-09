import './globals.css';
import { Poppins } from 'next/font/google';
import { QueryProvider } from '@/app/lib/QueryProvider';
import { AuthProvider } from '@/app/lib/AuthProvider';
import { Toast } from '@/app/components/Toast';
import { BRAND, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/app/lib/site';

// Poppins Black é a fonte da logo
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
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
  themeColor: BRAND.background,
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // A vistoria é preenchida no celular: pinçar para ler uma descrição longa
  // precisa continuar funcionando.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        <QueryProvider>
          <AuthProvider>
            <Toast />
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
