import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { useUnsavedStore } from '@/app/store/unsaved';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
import api from '../../lib/api';

const PREDIO = 'p1';

/** O dia da vistoria, N dias atrás — é dele que sai a espera da fila. */
function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ocorrencia(id, { prioridade = 'MEDIA', dias = 0, descricao = 'Lâmpada do corredor', andar = '3º andar' } = {}) {
  return {
    id,
    maintenance_type: 'ELETRICA',
    category: 'CORRETIVA',
    priority: prioridade,
    description: descricao,
    status: 'ABERTO',
    responsible: null,
    responsible_id: null,
    floor: { id: 'f1', label: andar },
    report: {
      id: 'r1',
      date: diasAtras(dias),
      building: { id: PREDIO, name: 'Aurora' },
      inspector: { id: 'u1', name: 'Carlos' },
    },
  };
}

const RESPONSAVEIS = [{ id: 'resp-1', name: 'Marina' }, { id: 'resp-2', name: 'Rui' }];

function responder(tickets) {
  return (url) => {
    if (url.includes('/responsibles')) return Promise.resolve({ data: RESPONSAVEIS });
    if (url.includes('/tickets')) return Promise.resolve({ data: { tickets } });
    return Promise.resolve({ data: {} });
  };
}

function Tela(tickets) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  api.get.mockImplementation(responder(tickets));

  return render(
    <QueryClientProvider client={client}>
      <ChamadosBoard buildingId={PREDIO} />
    </QueryClientProvider>
  );
}

/** As linhas da fila, na ordem em que aparecem. */
const linhas = () => screen.getAllByRole('button', { name: /andar ·/ });

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  useUnsavedStore.setState({ dirty: [], pending: null });
});

/**
 * A fila de triagem do moderador.
 *
 * A tela tem um trabalho só — decidir quem atende e mandar. O que se cobre aqui
 * são as três perguntas que ela passou a responder e que a versão anterior não
 * respondia: quanto tem na fila, o que é urgente, e o que já esperou demais.
 */
describe('ChamadosBoard', () => {
  it('diz o tamanho da fila e quanto dela é urgente', async () => {
    Tela([
      ocorrencia('a', { prioridade: 'ALTA' }),
      ocorrencia('b', { prioridade: 'ALTA' }),
      ocorrencia('c', { prioridade: 'BAIXA' }),
    ]);

    expect(await screen.findByText('3 ocorrências esperando · 2 de prioridade alta')).toBeInTheDocument();
  });

  it('no singular a frase concorda', async () => {
    Tela([ocorrencia('a', { prioridade: 'BAIXA' })]);

    // Sem altas, a segunda parte da frase nem existe — em vez de "0 de alta".
    expect(await screen.findByText('1 ocorrência esperando')).toBeInTheDocument();
  });

  /**
   * O limite é por prioridade: uma alta parada há três dias é pior notícia que
   * uma baixa parada há duas semanas, e uma fila que pinta as duas do mesmo
   * jeito não ajuda a decidir por onde começar.
   */
  it('só conta como atrasado quem passou do limite da própria prioridade', async () => {
    Tela([
      // ALTA aguenta 2 dias; esta passou.
      ocorrencia('atrasada', { prioridade: 'ALTA', dias: 5 }),
      // BAIXA aguenta 15; esta ainda não.
      ocorrencia('no-prazo', { prioridade: 'BAIXA', dias: 5 }),
    ]);

    expect(await screen.findByText('1 esperando demais')).toBeInTheDocument();
  });

  it('sem nada atrasado, o aviso não aparece', async () => {
    Tela([ocorrencia('a', { prioridade: 'ALTA', dias: 1 })]);

    await screen.findByText('1 ocorrência esperando · 1 de prioridade alta');
    expect(screen.queryByText(/esperando demais/)).not.toBeInTheDocument();
  });

  it('cada linha diz há quanto tempo espera, em português de gente', async () => {
    Tela([
      ocorrencia('hoje', { dias: 0, andar: '1º andar' }),
      ocorrencia('ontem', { dias: 1, andar: '2º andar' }),
      ocorrencia('semana', { dias: 4, andar: '4º andar' }),
    ]);

    await screen.findByText('hoje');
    expect(screen.getByText('ontem')).toBeInTheDocument();
    expect(screen.getByText('há 4 dias')).toBeInTheDocument();
  });

  it('abre na primeira ocorrência, sem ninguém escolher', async () => {
    Tela([ocorrencia('a', { descricao: 'Infiltração no forro' }), ocorrencia('b')]);

    // A descrição inteira só existe no painel; na linha ela vem cortada.
    expect(await screen.findByText('O que está acontecendo')).toBeInTheDocument();
    expect(linhas()[0]).toHaveAttribute('aria-current', 'true');
  });

  it('as setas andam pela fila sem tirar a mão do teclado', async () => {
    const user = userEvent.setup();
    Tela([
      ocorrencia('a', { andar: '1º andar' }),
      ocorrencia('b', { andar: '2º andar' }),
      ocorrencia('c', { andar: '3º andar' }),
    ]);

    await screen.findByText('O que está acontecendo');
    linhas()[0].focus();

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(linhas()[1]).toHaveAttribute('aria-current', 'true'));

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(linhas()[2]).toHaveAttribute('aria-current', 'true'));

    // No fim da fila a seta não faz nada — não dá a volta.
    await user.keyboard('{ArrowDown}');
    expect(linhas()[2]).toHaveAttribute('aria-current', 'true');

    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(linhas()[1]).toHaveAttribute('aria-current', 'true'));
  });

  it('encaminhar é o gesto da tela, e só vale com alguém escolhido', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: {} });
    Tela([ocorrencia('a')]);

    const enviar = await screen.findByRole('button', { name: /Encaminhar/ });
    expect(enviar).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Encaminhar para' }));
    await user.click(await screen.findByRole('option', { name: 'Marina' }));

    await waitFor(() => expect(enviar).not.toBeDisabled());
    await user.click(enviar);

    expect(api.post).toHaveBeenCalledWith('/tickets/a/forward', { responsible_id: 'resp-1' });
  });

  it('escolher e trocar de ocorrência pergunta antes de perder a escolha', async () => {
    const user = userEvent.setup();
    Tela([ocorrencia('a'), ocorrencia('b')]);

    await screen.findByText('O que está acontecendo');
    await user.click(screen.getByRole('combobox', { name: 'Encaminhar para' }));
    await user.click(await screen.findByRole('option', { name: 'Rui' }));

    await user.click(linhas()[1]);

    expect(await screen.findByText('Descartar alterações?')).toBeInTheDocument();
  });

  it('prédio sem responsável diz o que fazer, em vez de um droplist vazio', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/responsibles')) return Promise.resolve({ data: [] });
      if (url.includes('/tickets')) return Promise.resolve({ data: { tickets: [ocorrencia('a')] } });
      return Promise.resolve({ data: {} });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <ChamadosBoard buildingId={PREDIO} />
      </QueryClientProvider>
    );

    expect(await screen.findByText(/ainda não tem ninguém com o papel de responsável/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Encaminhar$/ })).not.toBeInTheDocument();
  });

  it('fila vazia é boa notícia, e a tela diz isso', async () => {
    Tela([]);

    expect(await screen.findByText('Fila limpa')).toBeInTheDocument();
    expect(screen.getByText(/já tem um responsável/)).toBeInTheDocument();
  });

  it('a linha traz o contexto mínimo para escolher qual abrir', async () => {
    Tela([ocorrencia('a', { prioridade: 'ALTA', andar: '6º andar' })]);

    const linha = (await screen.findAllByRole('button', { name: /andar ·/ }))[0];
    expect(within(linha).getByText('6º andar · Elétrica')).toBeInTheDocument();
    expect(within(linha).getByText('Alta · Corretiva')).toBeInTheDocument();
  });
});
