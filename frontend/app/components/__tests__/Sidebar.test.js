import { render, screen, act, within } from '@testing-library/react';
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
 * de forma três vezes — pílula com o número na barra aberta, ponto no canto do
 * ícone no trilho, e o número de volta no balão que abre ao lado — e é
 * justamente quando a barra está estreita que ele mais importa, porque não há
 * mais texto nenhum dizendo o que está esperando ali.
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

    // Quem lê a tela com leitor continua ouvindo "Painel".
    const link = screen.getByRole('link', { name: 'Painel' });
    expect(link).toBeInTheDocument();
    // Dentro do link, e não na tela toda: o balão do trilho também escreve
    // "Painel", e o que se afirma aqui é sobre o rótulo de verdade.
    expect(within(link).getByText('Painel')).toHaveStyle({ opacity: '0' });
  });

  /**
   * O nome da aba ao lado do ícone, no trilho.
   *
   * Ele é decoração para quem usa leitor de tela — o rótulo verdadeiro continua
   * no link, logo acima —, e por isso sai do alcance dele. O nome acessível do
   * link tem de continuar sendo "Painel", e não "Painel Painel", que é no que
   * daria um balão sem `aria-hidden`.
   */
  it('mostra o nome ao lado do ícone só quando a barra está recolhida', async () => {
    const { container } = render(<Barra />);
    expect(container.querySelectorAll('.rail-tip')).toHaveLength(0);

    await userEvent.click(recolher());

    const balloes = [...container.querySelectorAll('.rail-tip')];
    // `firstChild`: o nome é o nó de texto: o contador vem depois dele, na
    // pílula própria que a asserção seguinte cobre.
    expect(balloes.map((b) => b.firstChild.textContent)).toEqual(['Painel', 'Novos chamados']);
    balloes.forEach((b) => expect(b).toHaveAttribute('aria-hidden', 'true'));
    expect(screen.getByRole('link', { name: 'Painel' })).toBeInTheDocument();

    // O balão é o único lugar do trilho com largura para o número.
    expect(balloes[0].querySelector('.rail-tip__count')).toBeNull();
    expect(balloes[1].querySelector('.rail-tip__count')).toHaveTextContent('7');

    await userEvent.click(expandir());
    expect(container.querySelectorAll('.rail-tip')).toHaveLength(0);
  });

  it('vira ponto o contador que não cabe mais em número', async () => {
    render(<Barra />);
    expect(screen.getByText('7')).toBeInTheDocument();

    await userEvent.click(recolher());

    const link = screen.getByRole('link', { name: 'Novos chamados' });
    // Dentro do item, e não na tela toda: o número não cabe ao lado do ícone e
    // sai da pílula, mas continua existindo no balão que abre ao lado.
    expect(within(link).queryByText('7')).not.toBeInTheDocument();
    // O aviso continua: o que muda é a forma dele.
    expect(link.querySelector('span[aria-hidden="true"]')).toBeInTheDocument();
  });
});
