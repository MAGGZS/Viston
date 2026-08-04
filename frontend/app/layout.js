import './globals.css';
import { QueryProvider } from '@/app/lib/QueryProvider';
import { AuthProvider } from '@/app/lib/AuthProvider';

export const metadata = {
  title: 'Viston',
  description: 'Sistema de Vistoria Predial',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
