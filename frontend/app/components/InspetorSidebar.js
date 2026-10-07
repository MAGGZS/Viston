'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, CalendarDays, ClipboardList, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { memberships } from '@/app/lib/roles';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';

/**
 * O menu do inspetor no computador.
 *
 * Duas abas, e de propósito: no computador o inspetor planeja (a agenda, o mês
 * dele) e consulta (o histórico) — vistoriar é no celular, andando pelo prédio.
 * Perfil e saída no pé, como nas mesas do moderador e do responsável.
 *
 * Conta mista — inspetor num prédio, visualizador em outro — ganha a aba
 * "Agenda", que leva à agenda do prédio que ela supervisiona (a página escolhe
 * sozinha um prédio em que ela é VIEWER). A pílula corre por índice × 44px, e
 * a aba entra no meio da lista sem mexer nessa conta: cada aba continua com
 * 40px e o mesmo vão.
 *
 * O subtítulo é o prédio ativo, como na barra do visualizador: a mesa fala de
 * um prédio por vez (o do seletor do cabeçalho). `buildingName` vem da página,
 * que sabe da troca na hora; sem ele, a barra lê a escolha guardada.
 */
export const AGENDA_DO_SUPERVISOR = '/desktop/visualizacao/agenda';

export function itensDoInspetor({ supervisiona = false } = {}) {
  return [
    { href: '/desktop/inspetor', icon: LayoutDashboard, label: 'Início' },
    ...(supervisiona ? [{ href: AGENDA_DO_SUPERVISOR, icon: CalendarDays, label: 'Agenda' }] : []),
    { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  ];
}

const PREDIO_DE_INSPETOR = (b) => b.role === 'INSPECTOR';

export function InspetorSidebar({ buildingName }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();

  const { active } = useActiveBuilding({ filter: PREDIO_DE_INSPETOR });
  const subtitle = buildingName ?? active?.name ?? 'Inspetor';
  const supervisiona = memberships(user).some((m) => m.role === 'VIEWER');

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={subtitle} />

      <SidebarNav>
        {itensDoInspetor({ supervisiona }).map(({ href, icon, label }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            active={pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
          />
        ))}
      </SidebarNav>

      <SidebarFooter>
        <SidebarItem href="/perfil" icon={User} label="Perfil" active={pathname.startsWith('/perfil')} collapsed={collapsed} animated={animated} />
        <SidebarItem
          icon={LogOut}
          label="Sair"
          collapsed={collapsed}
          animated={animated}
          onClick={async () => { await logout(); router.replace('/login'); }}
        />
      </SidebarFooter>
    </SidebarShell>
  );
}
