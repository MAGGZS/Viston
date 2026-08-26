'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Inbox, Workflow, CheckCheck, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { useTicketStats } from '@/app/hooks/useApi';

/**
 * O menu do moderador.
 *
 * Três telas, na ordem do caminho que o chamado faz: o que chegou e ninguém
 * encaminhou, o que está em curso, e o que já foi encerrado. O painel fica em
 * cima porque é onde ele cai ao entrar.
 *
 * "Processamento" reúne o que eram três abas — encaminhados, em andamento e
 * concluídos pelo responsável. Separadas, obrigavam a trocar de tela para
 * descobrir em que ponto o chamado estava; juntas, isso se vê de uma vez.
 *
 * `badge` é a chave do contador que vem de `useTicketStats`. Em "Novos" é a fila
 * inteira. Em "Processamento" é só o que o responsável já disse ter terminado —
 * o que espera decisão dele. O resto que aparece naquela tela está com outra
 * pessoa, e um número que sobe sozinho por trabalho alheio vira ruído.
 */
const items = [
  { href: '/moderador', icon: LayoutDashboard, label: 'Painel' },
  { href: '/moderador/chamados/novos', icon: Inbox, label: 'Novos chamados', badge: 'abertos' },
  { href: '/moderador/chamados/processamento', icon: Workflow, label: 'Processamento', badge: 'aguardando_fechamento' },
  { href: '/moderador/chamados/finalizados', icon: CheckCheck, label: 'Finalizados' },
];

export function ModeradorSidebar({ buildingId, buildingName }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();
  const { data: stats } = useTicketStats(buildingId);

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={buildingName} />

      <SidebarNav>
        {items.map(({ href, icon, label, badge }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            // O painel é exato; as telas de chamado casam por prefixo.
            active={href === '/moderador' ? pathname === href : pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
            count={badge ? stats?.[badge] : 0}
          />
        ))}
      </SidebarNav>

      <SidebarFooter>
        <SidebarItem href="/perfil" icon={User} label="Perfil" collapsed={collapsed} animated={animated} />
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
