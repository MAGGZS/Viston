'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, CalendarDays, ClipboardList, SquareKanban, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { isResponsible } from '@/app/lib/roles';

export const VISUALIZACAO_BASE = '/desktop/visualizacao';

/**
 * As abas do visualizador — o supervisor dos inspetores do prédio.
 *
 * Duas telas: o painel, onde ele cai ao entrar e lê como a equipe está indo, e
 * a agenda, onde marca e corrige as rondas. `supervisiona` esconde a agenda de
 * quem chegou aqui sem ser VIEWER em prédio nenhum (o inspetor, enquanto a
 * área própria dele não o redireciona): a API recusaria cada leitura dela.
 *
 * O histórico de vistorias é a terceira aba: tela comum às áreas, que abre com
 * esta mesma barra (ver `SidebarDaArea`). Fica por último para Painel e Agenda
 * manterem os índices — a pílula corre por índice × 44px.
 */
export function itensDoVisualizador({ supervisiona = true } = {}) {
  return [
    { href: VISUALIZACAO_BASE, icon: LayoutDashboard, label: 'Painel', exact: true },
    ...(supervisiona ? [{ href: `${VISUALIZACAO_BASE}/agenda`, icon: CalendarDays, label: 'Agenda' }] : []),
    { href: '/historico', icon: ClipboardList, label: 'Histórico' },
  ];
}

export function VisualizadorSidebar({ buildingName, supervisiona = true }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={buildingName} />

      <SidebarNav>
        {itensDoVisualizador({ supervisiona }).map(({ href, icon, label, exact }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            // O painel é a raiz da área: por prefixo, ficaria aceso na agenda.
            active={exact ? pathname === href : pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
          />
        ))}
      </SidebarNav>

      <SidebarFooter>
        {/* Quem supervisiona e também atende chamado tem a mesa dele na área
            do responsável — o atalho que ficava no cabeçalho da tela antiga. */}
        {isResponsible(user) && (
          <SidebarItem href="/responsavel/chamados" icon={SquareKanban} label="Meus chamados" collapsed={collapsed} animated={animated} />
        )}
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
