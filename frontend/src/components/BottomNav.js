'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, User } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/perfil', icon: User, label: 'Perfil' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-white/10 flex md:hidden z-50">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors',
              active ? 'text-accent' : 'text-text-secondary'
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
