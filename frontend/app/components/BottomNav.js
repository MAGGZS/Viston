'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, User } from 'lucide-react';

const items = [
  { href: '/home', icon: Home, label: 'Home' },
  { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/perfil', icon: User, label: 'Perfil' },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1A1A1A] border-t border-[#2A2A2A] flex lg:hidden z-40">
      {items.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center py-3 gap-1">
            <Icon size={22} className={active ? 'text-[#F5C518]' : 'text-[#9A9A9A]'} />
            <span className={`text-xs ${active ? 'text-[#F5C518]' : 'text-[#9A9A9A]'}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
