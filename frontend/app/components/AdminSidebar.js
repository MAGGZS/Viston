'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, Building2, LogOut } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';

const items = [
  { href: '/desktop/admin/predios', icon: Building2, label: 'Prédios' },
  { href: '/desktop/admin', icon: Users, label: 'Usuários' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const router = useRouter();

  return (
    <aside style={{ width: 232, minHeight: '100vh', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 20px 20px' }}>
        <Logo size={20} />
      </div>

      <div style={{ margin: '0 16px', height: 1, background: 'rgba(255,255,255,0.06)' }} />

      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(({ href, icon: Icon, label }) => {
          const active = href === '/desktop/admin'
            ? pathname === href
            : pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'all 0.2s', background: active ? 'rgba(245,197,24,0.1)' : 'transparent', color: active ? '#F5C518' : 'rgba(255,255,255,0.35)', border: active ? '1px solid rgba(245,197,24,0.15)' : '1px solid transparent' }}>
              <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '10px 10px 24px' }}>
        <div style={{ margin: '0 6px 10px', height: 1, background: 'rgba(255,255,255,0.06)' }} />
        <button onClick={() => { logout(); router.replace('/login'); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.3)', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', transition: 'all 0.2s' }}>
          <LogOut size={17} strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </aside>
  );
}
