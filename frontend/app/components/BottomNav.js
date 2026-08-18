'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, User, Wrench } from 'lucide-react';
import { M } from '@/app/components/mobile/kit';
import { useAuthStore } from '@/app/store/auth';
import { isResponsible } from '@/app/lib/roles';

const items = [
  { href: '/home', icon: Home, label: 'Início' },
  { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/perfil', icon: User, label: 'Perfil' },
];

/**
 * A barra de baixo.
 *
 * O responsável ganha uma entrada a mais: os chamados dele. Ela só aparece para
 * quem atende chamado em algum prédio — para o resto seria uma tela vazia.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const navItems = isResponsible(user)
    ? [items[0], { href: '/responsavel', icon: Wrench, label: 'Chamados' }, ...items.slice(1)]
    : items;

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: M.bg, borderTop: `1px solid ${M.line}`,
      padding: '10px 8px calc(14px + env(safe-area-inset-bottom))',
      display: 'flex',
    }}>
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            padding: '6px 0', textDecoration: 'none',
            color: active ? M.accent : M.faint, transition: 'color 0.2s',
          }}>
            <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
            <span style={{ fontFamily: M.display, fontSize: 11, fontWeight: active ? 600 : 500 }}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
