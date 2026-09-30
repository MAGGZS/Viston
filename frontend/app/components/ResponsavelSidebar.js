'use client';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, SquareKanban, History, ClipboardList, LogOut, User } from 'lucide-react';
import { SidebarShell, SidebarBrand, SidebarNav, SidebarFooter, SidebarItem } from '@/app/components/Sidebar';
import { useSidebar } from '@/app/store/sidebar';
import { useAuthStore } from '@/app/store/auth';
import { useMyTickets } from '@/app/hooks/useApi';

/**
 * O menu do responsável no computador.
 *
 * O painel em cima porque é onde ele cai ao entrar; o quadro logo abaixo porque
 * é onde o trabalho acontece. As duas telas de histórico ficam separadas de
 * propósito: "o que eu fiz" é a conta dele, e "o que aconteceu no prédio" é a
 * mesma leitura que o moderador tem — misturar as duas faria a pessoa procurar
 * o próprio trabalho no meio das vistorias dos outros.
 *
 * O número em "Chamados" é só o que espera aceite: é o único que depende de um
 * gesto dele agora. O resto já está com ele, e um contador que nunca zera vira
 * ruído.
 */
const items = [
  { href: '/responsavel/painel', icon: LayoutDashboard, label: 'Painel' },
  { href: '/responsavel/chamados', icon: SquareKanban, label: 'Chamados', badge: true },
  { href: '/responsavel/atividade', icon: History, label: 'Minha atividade' },
  { href: '/responsavel/historico', icon: ClipboardList, label: 'Histórico do prédio' },
];

export function ResponsavelSidebar({ subtitle = 'Responsável' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const { collapsed, animated, toggle } = useSidebar();
  // A mesma consulta do sino e do quadro: o cache é um só, e o número daqui
  // anda junto com o que as telas mostram.
  const { data } = useMyTickets(true, true);
  const aReceber = (data?.tickets ?? []).filter((t) => t.status === 'ENCAMINHADO').length;

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle={subtitle} />

      <SidebarNav>
        {items.map(({ href, icon, label, badge }) => (
          <SidebarItem
            key={href}
            href={href}
            icon={icon}
            label={label}
            active={pathname.startsWith(href)}
            collapsed={collapsed}
            animated={animated}
            count={badge ? aReceber : 0}
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
