'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, ClipboardList, CalendarDays, LogOut, Building2 } from 'lucide-react';
import clsx from 'clsx';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/store/auth';
import { Spinner } from '@/components/ui';

const NAV = [
  { href: '/admin/usuarios', icon: Users, label: 'Usuários' },
  { href: '/admin/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/admin/calendario', icon: CalendarDays, label: 'Calendário' },
];

export default function AdminLayout({ children }) {
  const { isLoading } = useRequireAuth(['ADMIN']);
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-bg-secondary border-r border-white/10 flex flex-col">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-bg-primary" />
          </div>
          <span className="font-extrabold text-lg">Viston</span>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-colors',
                  active ? 'bg-accent text-bg-primary' : 'text-text-secondary hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 w-full text-sm font-semibold transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
