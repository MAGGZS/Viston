import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/login',
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
import api from '../lib/api';

import LoginPage from '@/app/login/page';

function Tela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>
  );
}

/** A resposta do servidor a um erro, no formato que o interceptor entrega. */
function recusa(code, message, status = 401) {
  return Object.assign(new Error(message), {
    response: { status, data: { error: { code, message } } },
  });
}

const email = () => screen.getByLabelText('E-mail');
const senha = () => screen.getByLabelText('Senha');
const entrar = () => screen.getByRole('button', { name: /Entrar/ });

beforeEach(() => {
  api.post.mockReset();
});

/**
 * Os erros da tela de entrar.
 *
 * O de credencial ia para uma caixa vermelha abaixo do formulário, longe dos
 * dois campos que a pessoa precisa corrigir: a tela dizia que algo estava
 * errado sem apontar onde. Agora ele marca os campos e escreve embaixo, como o
 * "Obrigatório" já fazia.
 */
describe('login — como o erro aparece', () => {
  it('campo em branco continua marcando o campo', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(entrar());

    expect(await screen.findAllByText('Obrigatório')).toHaveLength(2);
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(senha()).toHaveAttribute('aria-invalid', 'true');
    // Nem chegou a sair da tela.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('credencial errada marca os dois campos e escreve sob a senha', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(recusa('UNAUTHORIZED', 'Credenciais inválidas'));
    Tela();

    await user.type(email(), 'marina@viston.com');
    await user.type(senha(), 'senha-errada');
    await user.click(entrar());

    // Texto da tela, e não o do servidor.
    const aviso = await screen.findByText('E-mail ou senha incorretos');
    expect(screen.queryByText('Credenciais inválidas')).not.toBeInTheDocument();

    // Os dois: o servidor responde igual para endereço inexistente e senha
    // errada, e a tela não finge saber qual dos dois foi.
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(senha()).toHaveAttribute('aria-invalid', 'true');

    // Quem usa leitor de tela chega à mensagem a partir de qualquer um deles.
    expect(email()).toHaveAttribute('aria-describedby', aviso.id);
    expect(senha()).toHaveAttribute('aria-describedby', aviso.id);
  });

  it('digitar de novo apaga o vermelho da tentativa anterior', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(recusa('UNAUTHORIZED', 'Credenciais inválidas'));
    Tela();

    await user.type(email(), 'marina@viston.com');
    await user.type(senha(), 'senha-errada');
    await user.click(entrar());
    await screen.findByText('E-mail ou senha incorretos');

    await user.type(senha(), 'x');

    await waitFor(() => {
      expect(screen.queryByText('E-mail ou senha incorretos')).not.toBeInTheDocument();
    });
    expect(senha()).not.toHaveAttribute('aria-invalid');
  });

  it('o que não é de campo nenhum continua na caixa', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(recusa('LIMITE', 'Muitas tentativas. Aguarde alguns minutos.', 429));
    Tela();

    await user.type(email(), 'marina@viston.com');
    await user.type(senha(), 'qualquer-uma');
    await user.click(entrar());

    // Teto de tentativas não se corrige digitando de novo: marcar os campos de
    // vermelho mentiria sobre o que houve.
    expect(await screen.findByText('Muitas tentativas. Aguarde alguns minutos.')).toBeInTheDocument();
    expect(email()).not.toHaveAttribute('aria-invalid');
    expect(senha()).not.toHaveAttribute('aria-invalid');
  });

  it('e-mail não confirmado segue sendo aviso, e não erro', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue(recusa('EMAIL_NAO_CONFIRMADO', 'Confirme seu e-mail', 403));
    Tela();

    await user.type(email(), 'marina@viston.com');
    await user.type(senha(), 'a-senha-certa');
    await user.click(entrar());

    expect(await screen.findByText('Confirme seu e-mail para liberar o acesso.')).toBeInTheDocument();
    // A senha estava certa: marcar os campos culparia quem acertou.
    expect(email()).not.toHaveAttribute('aria-invalid');
    expect(senha()).not.toHaveAttribute('aria-invalid');
  });
});
