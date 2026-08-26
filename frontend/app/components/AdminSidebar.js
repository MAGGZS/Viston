'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Users, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { useFeedbacks } from '@/app/hooks/useApi';

// O admin não administra mais prédios — isso é do gestor. Aqui ficam os
// números do sistema, as contas e o que o público manda dizer.
const items = [
  { href: '/desktop/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/desktop/admin', icon: Users, label: 'Usuários' },
  { href: '/desktop/admin/feedbacks', icon: MessageSquare, label: 'Feedbacks' },
];

/**
 * O menu do admin.
 *
 * O aviso de feedback pendente mora aqui, e não na tela de feedbacks: quem está
 * no dashboard precisa saber que chegou coisa nova sem ter de ir olhar. A
 * contagem vem junto com a lista de pendentes — é a mesma consulta que a tela
 * já faz.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();
  const { data: feedbacks } = useFeedbacks('PENDENTE');

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} />

      <SidebarNav>
        {items.map(({ href, icon, label }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            active={href === '/desktop/admin' ? pathname === href : pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
            count={href === '/desktop/admin/feedbacks' ? feedbacks?.pending : 0}
          />
        ))}
      </SidebarNav>

      <SidebarFooter>
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
