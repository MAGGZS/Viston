import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuDaConta } from '@/app/components/MenuDaConta';
import { useAuthStore } from '@/app/store/auth';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...a) => push(...a), replace: (...a) => replace(...a) }),
  usePathname: () => '/desktop/visualizacao',
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn().mockResolvedValue({ data: {} }) },
}));

const USUARIO = { id: 'u1', name: 'Marina Alves', email: 'marina@viston.com' };

const gatilho = () => screen.getByRole('button', { name: 'Menu da conta' });

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  useAuthStore.setState({ user: USUARIO });
});

/**
 * O menu da conta das telas sem barra lateral.
 *
 * A foto no canto era um link solto para o perfil: sair exigia abrir outra tela
 * para achar o botão.
 */
describe('MenuDaConta', () => {
  it('nasce fechado, e o gatilho diz isso', () => {
    render(<MenuDaConta user={USUARIO} />);

    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('abre com as duas opções, e diz de quem é a conta', async () => {
    const user = userEvent.setup();
    render(<MenuDaConta user={USUARIO} />);

    await user.click(gatilho());

    expect(gatilho()).toHaveAttribute('aria-expanded', 'true');
    // Numa tela sem barra lateral o nome da conta não aparece em lugar nenhum,
    // e trocar de conta sem perceber é engano que só se descobre depois.
    expect(screen.getByText('Marina Alves')).toBeInTheDocument();
    expect(screen.getByText('marina@viston.com')).toBeInTheDocument();

    expect(screen.getByRole('menuitem', { name: /Perfil/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Sair/ })).toBeInTheDocument();
  });

  it('"Perfil" leva ao perfil e fecha o menu', async () => {
    const user = userEvent.setup();
    render(<MenuDaConta user={USUARIO} />);

    await user.click(gatilho());
    await user.click(screen.getByRole('menuitem', { name: /Perfil/ }));

    expect(push).toHaveBeenCalledWith('/perfil');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('"Sair" encerra a sessão e volta ao login', async () => {
    const user = userEvent.setup();
    render(<MenuDaConta user={USUARIO} />);

    await user.click(gatilho());
    await user.click(screen.getByRole('menuitem', { name: /Sair/ }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('o Escape fecha e devolve o foco a quem abriu', async () => {
    const user = userEvent.setup();
    render(<MenuDaConta user={USUARIO} />);

    await user.click(gatilho());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    // Sem isto o foco cai no `<body>`, e a próxima tecla recomeça a navegação.
    expect(gatilho()).toHaveFocus();
  });

  it('clicar fora fecha', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outra coisa</button>
        <MenuDaConta user={USUARIO} />
      </div>
    );

    await user.click(gatilho());
    await user.click(screen.getByRole('button', { name: 'Outra coisa' }));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
