'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { useFeedbacks } from '@/app/hooks/useApi';
import { T, R, W, NUM } from '@/app/lib/theme';

// O admin não administra mais prédios — isso é do gestor. Aqui ficam os
// números do sistema, as contas e o que o público manda dizer.
const items = [
  { href: '/desktop/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/desktop/admin', icon: Users, label: 'Usuários' },
  { href: '/desktop/admin/feedbacks', icon: MessageSquare, label: 'Feedbacks' },
];

const itemBase = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 14,
  fontFamily: T.display, fontSize: 14, textDecoration: 'none',
  transition: 'background-color 0.15s, color 0.15s',
};

/**
 * Quantos feedbacks ninguém leu ainda.
 *
 * O aviso mora no menu, e não na tela de feedbacks: quem está no dashboard
 * precisa saber que chegou coisa nova sem ter de ir olhar. A contagem vem junto
 * com a lista de pendentes — é a mesma consulta que a tela já faz.
 */
function PendingBadge({ count, active }) {
  if (!count) return null;

  return (
    <span style={{
      marginLeft: 'auto', minWidth: 20, padding: '1px 6px', borderRadius: R.badge,
      // Sobre o item ativo — que já é dourado — a pílula inverte: dourado sobre
      // dourado não se lê, e o número é justamente o que precisa ser visto.
      background: active ? 'rgba(0,0,0,0.18)' : T.accent,
      color: T.onAccent,
      fontSize: 12, fontWeight: W.strong, textAlign: 'center', ...NUM,
    }}>
      {count}
    </span>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const router = useRouter();
  const { data: feedbacks } = useFeedbacks('PENDENTE');

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
              {href === '/desktop/admin/feedbacks' && <PendingBadge count={feedbacks?.pending} active={active} />}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '0 12px 22px' }}>
        <button
          onClick={async () => { await logout(); router.replace('/login'); }}
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
