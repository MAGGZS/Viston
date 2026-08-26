import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox, LayoutDashboard } from 'lucide-react';
import {
  SidebarShell, SidebarBrand, SidebarNav, SidebarItem, SIDEBAR_OPEN, SIDEBAR_RAIL,
} from '@/app/components/Sidebar';
import { useSidebar, useSidebarStore } from '@/app/store/sidebar';

jest.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ replace: jest.fn() }) }));

/**
 * A barra lateral que abre e fecha.
 *
 * O que se testa aqui é o que quebraria calado. Recolhida, a barra é só ícone —
 * e o rótulo que some da tela não pode sumir do leitor de tela junto, senão a
 * navegação inteira vira seis botões sem nome. O contador é o outro: ele muda
 * de forma (pílula com o número, ponto no canto do ícone) e é justamente quando
 * a barra está estreita que ele mais importa, porque não há mais texto nenhum
 * dizendo o que está esperando ali.
 */
function Barra() {
  const { collapsed, animated, toggle } = useSidebar();

  return (
    <SidebarShell collapsed={collapsed} animated={animated} onToggle={toggle}>
      <SidebarBrand collapsed={collapsed} animated={animated} subtitle="Edifício Aurora" />
      <SidebarNav>
        <SidebarItem href="/painel" icon={LayoutDashboard} label="Painel" active collapsed={collapsed} animated={animated} />
        <SidebarItem href="/novos" icon={Inbox} label="Novos chamados" count={7} collapsed={collapsed} animated={animated} />
      </SidebarNav>
    </SidebarShell>
  );
}

const aside = () => document.querySelector('aside');
const recolher = () => screen.getByRole('button', { name: 'Recolher menu' });
const expandir = () => screen.getByRole('button', { name: 'Expandir menu' });

beforeEach(() => {
  window.localStorage.clear();
  useSidebarStore.setState({ collapsed: false, animated: false, hydrated: false });
});

describe('Sidebar', () => {
  it('mostra a logo base com o nome escrito ao lado', () => {
    render(<Barra />);

    // A marca é vetor; a palavra é texto do código — é o que a deixa sumir
    // sozinha quando a barra recolhe.
    expect(screen.getByRole('img', { name: 'Viston' })).toBeInTheDocument();
    expect(screen.getByText('VISTON')).toBeInTheDocument();
  });

  it('troca a largura entre a barra aberta e o trilho de ícones', async () => {
    render(<Barra />);
    expect(aside()).toHaveStyle({ width: `${SIDEBAR_OPEN}px` });

    await userEvent.click(recolher());
    expect(aside()).toHaveStyle({ width: `${SIDEBAR_RAIL}px` });

    await userEvent.click(expandir());
    expect(aside()).toHaveStyle({ width: `${SIDEBAR_OPEN}px` });
  });

  it('guarda a escolha, para a barra não voltar ao padrão a cada tela', async () => {
    const { unmount } = render(<Barra />);
    await userEvent.click(recolher());
    unmount();

    // A troca de tela remonta a barra e zera a store, como um recarregamento.
    useSidebarStore.setState({ collapsed: false, animated: false, hydrated: false });
    await act(async () => { render(<Barra />); });

    expect(aside()).toHaveStyle({ width: `${SIDEBAR_RAIL}px` });
  });

  it('mantém o rótulo no DOM quando recolhida, só invisível', async () => {
    render(<Barra />);
    await userEvent.click(recolher());

    // Quem lê a tela com leitor continua ouvindo "Painel"; quem lê com os olhos
    // tem o `title` do ícone.
    expect(screen.getByRole('link', { name: 'Painel' })).toBeInTheDocument();
    expect(screen.getByText('Painel')).toHaveStyle({ opacity: '0' });
  });

  it('vira ponto o contador que não cabe mais em número', async () => {
    render(<Barra />);
    expect(screen.getByText('7')).toBeInTheDocument();

    await userEvent.click(recolher());
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    // O aviso continua: o que muda é a forma dele.
    expect(screen.getByRole('link', { name: 'Novos chamados' }).querySelector('span[aria-hidden="true"]'))
      .toBeInTheDocument();
  });
});
