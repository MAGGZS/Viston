import './globals.css';
import { QueryProvider } from '@/app/lib/QueryProvider';
import { AuthProvider } from '@/app/lib/AuthProvider';
import { Toast } from '@/app/components/Toast';

export const metadata = {
  title: 'Viston',
  description: 'Sistema de Vistoria Predial',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
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
