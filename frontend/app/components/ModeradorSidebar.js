'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Inbox, Send, Loader, CheckCheck, LogOut, User } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { useAuthStore } from '@/app/store/auth';
import { useTicketStats } from '@/app/hooks/useApi';
import { T, R, W, NUM } from '@/app/lib/theme';

/**
 * O menu do moderador.
 *
 * As telas de chamado são o produto dele, e estão na ordem do caminho que o
 * chamado faz: o que chegou e ninguém encaminhou, o que foi mandado e espera
 * aceite, o que está correndo, e o que ele já fechou. O painel fica em cima
 * porque é onde ele cai ao entrar.
 */
const items = [
  { href: '/moderador', icon: LayoutDashboard, label: 'Painel' },
  { href: '/moderador/chamados/novos', icon: Inbox, label: 'Novos chamados', badge: 'abertos' },
  { href: '/moderador/chamados/encaminhados', icon: Send, label: 'Encaminhados', badge: 'encaminhados' },
  { href: '/moderador/chamados/andamento', icon: Loader, label: 'Em andamento', badge: 'aguardando_fechamento' },
  { href: '/moderador/chamados/concluidos', icon: CheckCheck, label: 'Concluídas' },
];

const itemBase = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 14,
  fontFamily: T.display, fontSize: 13, textDecoration: 'none',
  transition: 'background-color 0.15s, color 0.15s',
};

/**
 * Quantos chamados esperam ele.
 *
 * Em "Novos" é a fila inteira; em "Encaminhados", o que ainda não foi aceito —
 * é o que ele tem de cobrar. Em "Em andamento" é só o que o responsável já
 * disse ter terminado: o resto está com outra pessoa, e um número que sobe
 * sozinho por trabalho alheio vira ruído.
 */
function CountBadge({ count, active }) {
  if (!count) return null;

  return (
    <span style={{
      marginLeft: 'auto', minWidth: 20, padding: '1px 6px', borderRadius: R.badge,
      background: active ? 'rgba(0,0,0,0.18)' : T.accent,
      color: T.onAccent,
      fontSize: 11, fontWeight: W.strong, textAlign: 'center', ...NUM,
    }}>
      {count}
    </span>
  );
}

export function ModeradorSidebar({ buildingId, buildingName }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const { data: stats } = useTicketStats(buildingId);

  return (
    <aside style={{ width: 224, minHeight: '100vh', background: T.bg, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '22px 18px 18px' }}>
        <Logo size={19} />
        {buildingName && (
          <p style={{ color: T.faint, fontSize: 11, marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {buildingName}
          </p>
        )}
      </div>

      <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(({ href, icon: Icon, label, badge }) => {
          // O painel é exato; as telas de chamado casam por prefixo.
          const active = href === '/moderador' ? pathname === href : pathname.startsWith(href);
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
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {badge && <CountBadge count={stats?.[badge]} active={active} />}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '0 12px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Link
          href="/perfil"
          style={{ ...itemBase, fontWeight: W.body, color: T.mute }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <User size={16} strokeWidth={1.8} />
          Perfil
        </Link>
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          style={{ ...itemBase, fontWeight: W.body, color: T.mute, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sair
        </button>
      </div>
    </aside>
  );
}
