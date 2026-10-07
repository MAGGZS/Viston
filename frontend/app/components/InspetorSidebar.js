'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ClipboardList, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { memberships } from '@/app/lib/roles';

/**
 * O menu do inspetor no computador.
 *
 * Duas abas, e de propósito: no computador o inspetor planeja (a agenda, o mês
 * dele) e consulta (o histórico) — vistoriar é no celular, andando pelo prédio.
 * Perfil e saída no pé, como nas mesas do moderador e do responsável.
 *
 * O subtítulo é o prédio quando ele vistoria um só; com mais de um, o papel —
 * a agenda desta mesa cruza todos eles.
 */
const items = [
  { href: '/desktop/inspetor', icon: LayoutDashboard, label: 'Início' },
  { href: '/historico', icon: ClipboardList, label: 'Histórico' },
];

export function InspetorSidebar() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();

  const predios = memberships(user).filter((m) => m.role === 'INSPECTOR');
  const subtitle = predios.length === 1 ? predios[0].name : 'Inspetor';

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={subtitle} />

      <SidebarNav>
        {items.map(({ href, icon, label }) => (
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
