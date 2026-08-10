'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, LayoutDashboard, LogOut } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { T, R, W } from '@/app/lib/theme';

// O admin não administra mais prédios — isso é do gestor. Aqui ficam os
// números do sistema e as contas.
const items = [
  { href: '/desktop/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/desktop/admin', icon: Users, label: 'Usuários' },
];

const itemBase = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 14,
  fontFamily: T.display, fontSize: 13, textDecoration: 'none',
  transition: 'background-color 0.15s, color 0.15s',
};

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const router = useRouter();

  return (
    <aside style={{ width: 208, minHeight: '100vh', background: T.bg, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '22px 18px 20px' }}>
        <Logo size={19} />
      </div>

      <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(({ href, icon: Icon, label }) => {
          const active = href === '/desktop/admin' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                ...itemBase,
                fontWeight: active ? W.strong : W.body,
                background: active ? T.accent : 'transparent',
                color: active ? T.onAccent : T.mute,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.chip; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '0 12px 22px' }}>
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          style={{ ...itemBase, fontWeight: W.body, color: T.mute, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }}
          onMouseEnter={e => { e.currentTarget.style.background = T.chip; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </aside>
  );
}
