'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, ClipboardList, CalendarDays, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIDEBAR_ITEMS = [
  { href: '/admin/usuarios', icon: Users, label: 'Usuários' },
  { href: '/admin/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/admin/calendario', icon: CalendarDays, label: 'Calendário' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="w-60 bg-bg-secondary border-r border-white/10 flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-bg-primary" />
            </div>
            <div>
              <p className="font-extrabold text-text-primary text-sm">Viston</p>
              <p className="text-[10px] text-text-muted">Painel Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1">
          {SIDEBAR_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <Link
            href="/home"
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            ← Voltar ao app
          </Link>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-auto bg-bg-primary p-8">{children}</main>
    </div>
  );
}
