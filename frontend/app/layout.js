import './globals.css';
import { Poppins } from 'next/font/google';
import { QueryProvider } from '@/app/lib/QueryProvider';
import { AuthProvider } from '@/app/lib/AuthProvider';
import { Toast } from '@/app/components/Toast';

// Poppins Black é a fonte da logo
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['900'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  title: 'Viston',
  description: 'Sistema de Vistoria Predial',
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
