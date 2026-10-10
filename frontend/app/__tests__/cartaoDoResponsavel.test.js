import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...a) => push(...a) }),
  usePathname: () => '/responsavel',
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
import api from '../lib/api';

import ResponsavelPage from '@/app/responsavel/page';
import { useAuthStore } from '@/app/store/auth';

const EU = 'u-marina';

const TICKET = {
  id: 't1',
  status: 'EM_ANDAMENTO',
  maintenance_type: 'ELETRICA',
  category: 'CORRETIVA',
  priority: 'ALTA',
  description: 'Lâmpada do corredor queimada, e o reator está zumbindo alto',
  responsible_id: EU,
  floor: { label: '3º andar' },
  report: { id: 'r1', date: '2026-08-20', building: { name: 'Aurora' } },
};

function Tela(tickets = [TICKET]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  // Por rota, e não uma resposta só para tudo: a tela pede duas coisas ao
  // servidor. Os chamados vêm num objeto (`{ tickets }`), e os prédios da conta
  // vêm numa lista — a caixa de registrar ocorrência consulta `/buildings/me`
  // para saber em qual prédio a ocorrência entra. Com uma resposta única, a
  // lista chegava como objeto e a caixa quebrava em `available.find`.
  api.get.mockImplementation((url) => {
    if (url.includes('/buildings/me')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: { tickets } });
  });

  return render(
    <QueryClientProvider client={client}>
      <ResponsavelPage />
    </QueryClientProvider>
  );
}

/**
 * A tela abre em "A receber", que é a fila do que cobra um gesto. Quem quer ver
 * um chamado em execução troca de fila primeiro — como a pessoa faria.
 */
async function abrirEmAndamento(user) {
  await user.click(await screen.findByRole('tab', { name: /Em andamento/ }));
}

beforeEach(() => {
  push.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  useAuthStore.setState({
    user: { id: EU, name: 'Marina', memberships: [{ building_id: 'p1', role: 'RESPONSAVEL' }] },
    isLoading: false,
  });
});

/**
 * O cartão da fila do responsável.
 *
 * Ele carregava a descrição inteira, o bloco do moderador, faixas de estado e
 * uma caixa de texto com o botão de concluir — era formulário, não cartão. O
 * que se cobre aqui é o que sobrou: a forma do cartão de ocorrência do
 * histórico, e um toque que leva à tela onde se trabalha o chamado.
 */
describe('cartão do responsável', () => {
  it('tem a forma do cartão de ocorrência: andar, tipo, contexto e etiquetas', async () => {
    const user = userEvent.setup();
    Tela();
    await abrirEmAndamento(user);

    const cartao = await screen.findByRole('button', { name: /Abrir Elétrica em 3º andar/ });

    // Dentro do cartão: "Em andamento" também é o nome da fila aberta, e o
    // teste tem de dizer de qual dos dois está falando.
    expect(within(cartao).getByText(/3º andar · Elétrica/)).toBeInTheDocument();
    expect(within(cartao).getByText('Aurora · Corretiva')).toBeInTheDocument();
    expect(within(cartao).getByText('Relatado em 20 de agosto de 2026')).toBeInTheDocument();
    expect(within(cartao).getByText('Em andamento')).toBeInTheDocument();
    expect(within(cartao).getByText('Alta')).toBeInTheDocument();
  });

  it('não carrega mais a descrição nem a caixa de concluir', async () => {
    const user = userEvent.setup();
    Tela();
    await abrirEmAndamento(user);
    await screen.findByText(/3º andar · Elétrica/);

    expect(screen.queryByText(/Lâmpada do corredor queimada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Informar conclusão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detalhes' })).not.toBeInTheDocument();
  });

  it('o toque abre a tela do chamado', async () => {
    const user = userEvent.setup();
    Tela();
    await abrirEmAndamento(user);

    await user.click(await screen.findByRole('button', { name: /Abrir Elétrica em 3º andar/ }));

    expect(push).toHaveBeenCalledWith('/responsavel/chamados/t1');
  });

  /**
   * Na fila "Concluídos" moram os dois fins do trabalho dele. A etiqueta
   * separa um do outro e diz quem fecha: o toque dele não fecha o chamado.
   */
  it('em "Concluídos", a etiqueta diz se espera o moderador ou se ele já fechou', async () => {
    const user = userEvent.setup();
    Tela([
      { ...TICKET, id: 't2', status: 'AGUARDANDO_FECHAMENTO', done_at: '2026-08-22T10:00:00.000Z' },
      { ...TICKET, id: 't3', status: 'CONCLUIDO', floor: { label: '5º andar' }, closed_at: '2026-08-23T10:00:00.000Z' },
    ]);

    await user.click(await screen.findByRole('tab', { name: /Concluídos/ }));

    const esperando = await screen.findByRole('button', { name: /Abrir Elétrica em 3º andar/ });
    expect(within(esperando).getByText('Aguardando o moderador fechar')).toBeInTheDocument();
    const fechado = screen.getByRole('button', { name: /Abrir Elétrica em 5º andar/ });
    expect(within(fechado).getByText('Fechado pelo moderador')).toBeInTheDocument();
  });

  it('"Concluídos" vazio explica o caminho, sem dizer que concluir fecha', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(await screen.findByRole('tab', { name: /Concluídos/ }));

    expect(
      await screen.findByText(/Quando você informar a conclusão de um chamado, ele aparece aqui aguardando o moderador fechar/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Você ainda não concluiu nenhum chamado')).not.toBeInTheDocument();
  });

  it('receber continua na lista, e não abre a tela junto', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: {} });
    Tela([{ ...TICKET, status: 'ENCAMINHADO', forwarded_at: '2026-08-21T10:00:00.000Z' }]);

    await user.click(await screen.findByRole('button', { name: /Receber/ }));

    expect(api.post).toHaveBeenCalledWith('/tickets/t1/receive');
    // O cartão inteiro abre a tela; receber para o clique antes de chegar nele.
    expect(push).not.toHaveBeenCalled();
  });
});

/**
 * O prazo no cartão da lista, no telefone.
 *
 * O mesmo fio do quadro do computador (`FioDoPrazo`): a barra do quanto já se
 * gastou e a notícia em palavras ao lado. Como o rótulo do botão substitui o
 * que está dentro dele, o prazo vai no rótulo também.
 */
describe('prazo no cartão do responsável', () => {
  const ATRASADO = { dias: 6, limite: 5, restantes: 0, consumo: 1.2, atrasado: true, em_risco: false, congelado: false };

  it('o atrasado diz "Atrasado" no cartão e no rótulo do botão', async () => {
    const user = userEvent.setup();
    Tela([{ ...TICKET, sla: ATRASADO }]);
    await abrirEmAndamento(user);

    const cartao = await screen.findByRole('button', { name: /Abrir Elétrica em 3º andar\. Atrasado há 1 dia útil/ });
    const texto = within(cartao).getByText('Atrasado há 1 dia útil');
    expect(texto.getAttribute('style')).toContain('var(--color-danger)');
  });

  it('no prazo, diz quanto falta', async () => {
    const user = userEvent.setup();
    Tela([{ ...TICKET, sla: { ...ATRASADO, dias: 1, restantes: 4, consumo: 0.2, atrasado: false } }]);
    await abrirEmAndamento(user);

    const cartao = await screen.findByRole('button', { name: /Abrir Elétrica em 3º andar/ });
    expect(within(cartao).getByText('4 dias úteis para o prazo')).toBeInTheDocument();
  });

  it('o que o moderador já fechou não mostra prazo', async () => {
    const user = userEvent.setup();
    Tela([{ ...TICKET, status: 'CONCLUIDO', closed_at: '2026-08-23T10:00:00.000Z', sla: { ...ATRASADO, congelado: true } }]);

    await user.click(await screen.findByRole('tab', { name: /Concluídos/ }));

    const cartao = await screen.findByRole('button', { name: 'Abrir Elétrica em 3º andar' });
    expect(within(cartao).queryByText(/Atrasado/)).not.toBeInTheDocument();
  });
});
