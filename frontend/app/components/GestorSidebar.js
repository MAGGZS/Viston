'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Inbox, Workflow, CheckCheck, UserCheck, Building2, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { useTicketStats, useAccessRequests } from '@/app/hooks/useApi';

/**
 * O menu do prédio, para quem o administra.
 *
 * As quatro primeiras abas são as mesmas do moderador, na mesma ordem e com os
 * mesmos contadores: o gestor trata os chamados do prédio dele — a API sempre
 * deixou (ver `canModerateBuilding` no backend), e sem tela isso era um poder
 * que só existia no papel. Prédio cujo moderador saiu ficava com a fila parada.
 *
 * Colaboradores fecha a lista porque é a aba de administração, e não de
 * trabalho diário: é onde se define quem é o quê ali dentro — inclusive quem
 * modera.
 */
function itemsFor(buildingId) {
  const base = `/gestor/predios/${buildingId}`;

  return [
    { href: base, icon: LayoutDashboard, label: 'Painel', exact: true },
    { href: `${base}/chamados/novos`, icon: Inbox, label: 'Novos chamados', badge: 'abertos' },
    { href: `${base}/chamados/processamento`, icon: Workflow, label: 'Processamento', badge: 'aguardando_fechamento' },
    { href: `${base}/chamados/finalizados`, icon: CheckCheck, label: 'Finalizados' },
    { href: `${base}/colaboradores`, icon: UserCheck, label: 'Colaboradores', badge: 'solicitacoes' },
  ];
}

export function GestorSidebar({ buildingId, buildingName }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();
  const { data: stats } = useTicketStats(buildingId);
  // Buscadas sempre, e não só na aba de colaboradores: sem isso o gestor teria
  // de abrir a tela para descobrir que existe alguém esperando aprovação.
  const { data: requests = [] } = useAccessRequests(buildingId);

  const counts = { ...stats, solicitacoes: requests.length };

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={buildingName} />

      <SidebarNav>
        {itemsFor(buildingId).map(({ href, icon, label, badge, exact }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            // O painel é a raiz do prédio, então tem de casar exato — por
            // prefixo ele ficaria aceso em todas as outras abas.
            active={exact ? pathname === href : pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
            count={badge ? counts[badge] : 0}
          />
        ))}
      </SidebarNav>

      <SidebarFooter>
        <SidebarItem href="/gestor" icon={Building2} label="Meus prédios" collapsed={collapsed} animated={animated} />
        <SidebarItem href={buildingId ? `/perfil?buildingId=${buildingId}` : '/perfil'} icon={User} label="Perfil" collapsed={collapsed} animated={animated} />
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
