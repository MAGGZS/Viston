import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProcessamentoBoard } from '@/app/components/ProcessamentoBoard';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
import api from '../../lib/api';

/**
 * A linha do que espera fechamento.
 *
 * Ela é um alvo de clique com dois botões dentro, e é aí que mora o que se
 * testa: o clique no botão não pode subir para a linha. Se subir, "Finalizar"
 * abre a caixa de finalizar *e* a de detalhe atrás dela — duas caixas para um
 * clique só, e a de baixo escondendo a de cima.
 *
 * A barreira já foi uma `div` com `onClick` em volta dos botões. Ela era
 * invisível para o teclado, então quem navega pelo Tab passava direto por um
 * elemento que escutava clique — e é por isso que a regra de acessibilidade a
 * barrava. Hoje quem segura o clique é cada botão, que já é botão.
 */
const TICKET = {
  id: 't1',
  floor: { label: '3º andar' },
  maintenance_type: 'ELETRICA',
  priority: 'ALTA',
  description: 'Lâmpada do corredor',
  responsible: 'Ana',
  responsible_id: 'u1',
  done_at: '2026-08-20T12:00:00.000Z',
  maintenance_cost: null,
};

/** Só a fila de "aguardando fechamento" tem linha; as outras duas vêm vazias. */
function respostaPorGrupo(_url, { params } = {}) {
  const tickets = params?.group === 'AGUARDANDO_FECHAMENTO' ? [TICKET] : [];
  return Promise.resolve({ data: { tickets } });
}

function Board() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <ProcessamentoBoard buildingId="p1" />
    </QueryClientProvider>
  );
}

const caixas = () => document.querySelectorAll('dialog');

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(respostaPorGrupo);
});

describe('ProcessamentoBoard', () => {
  it('abre só a caixa de finalizar quando se clica em Finalizar', async () => {
    render(<Board />);
    const finalizar = await screen.findByRole('button', { name: /^Finalizar$/ });

    await userEvent.click(finalizar);

    expect(await screen.findByText('Finalizar chamado')).toBeInTheDocument();
    // Uma só: o clique não subiu para a linha, que abriria o detalhe atrás.
    expect(caixas()).toHaveLength(1);
  });

  it('abre o detalhe quando se clica na linha', async () => {
    render(<Board />);
    const linha = await screen.findByText('Lâmpada do corredor');

    await userEvent.click(linha);

    await waitFor(() => expect(caixas()).toHaveLength(1));
    expect(screen.queryByText('Finalizar chamado')).not.toBeInTheDocument();
  });

  it('leva o cursor ao valor assim que o gasto é marcado', async () => {
    render(<Board />);
    await userEvent.click(await screen.findByRole('button', { name: /^Finalizar$/ }));

    // O campo nem existe antes: perguntar o valor de um gasto que ninguém disse
    // que houve empurra quem não teve despesa a digitar zero.
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Houve gasto nesta manutenção'));

    const valor = await screen.findByLabelText('Valor (R$)');
    expect(valor).toHaveFocus();
  });
});
