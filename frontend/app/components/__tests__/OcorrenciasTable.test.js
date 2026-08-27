import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

/**
 * A troca de página da lista de histórico.
 *
 * O que se cobre aqui é a janela da espera. A página anterior ficava na tela
 * enquanto a próxima não chegava — o clique na seta não dizia nada, e entre
 * duas páginas parecidas não havia como saber se o que estava sendo lido já era
 * o novo. Agora ela sai, e o lugar dela é de esqueleto até a resposta chegar.
 *
 * A altura é a outra metade: o cartão divide a fileira com o calendário, e uma
 * lista que esvazia e volta faria os dois sanfonarem a cada seta.
 */
const TOTAL = 20;
const POR_PAGINA = 8;

/** Uma página de ocorrências, com o andar numerado para dar para reconhecê-la. */
function pagina(_url, { params }) {
  const primeiro = (params.page - 1) * params.limit;
  const tickets = Array.from(
    { length: Math.max(0, Math.min(params.limit, TOTAL - primeiro)) },
    (_, i) => ({
      id: `o${primeiro + i}`,
      floor: { label: `Andar ${primeiro + i}` },
      maintenance_type: 'ELETRICA',
      status: 'ABERTO',
      report: { date: '2026-08-20' },
    })
  );
  return Promise.resolve({
    data: { tickets, total: TOTAL, page: params.page, limit: params.limit, pages: Math.ceil(TOTAL / params.limit) },
  });
}

function Tabela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <OcorrenciasTable buildingId="p1" />
    </QueryClientProvider>
  );
}

const linhas = () => document.querySelectorAll('tbody tr');

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(pagina);
});

describe('OcorrenciasTable', () => {
  it('tira a página anterior da tela enquanto a próxima não chega', async () => {
    render(<Tabela />);
    await screen.findByText('Andar 0');

    // A próxima página fica pendurada: é a janela da espera.
    let entregar;
    api.get.mockImplementation(
      (url, config) => new Promise((resolve) => { entregar = () => resolve(pagina(url, config)); })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));

    await waitFor(() => expect(screen.queryByText('Andar 0')).not.toBeInTheDocument());
    // Nem a página velha, nem a nova: o que está ali é espera — e com o mesmo
    // número de linhas, para o cartão não mudar de altura.
    expect(screen.queryByText('Andar 8')).not.toBeInTheDocument();
    expect(linhas()).toHaveLength(POR_PAGINA);

    await act(async () => { entregar(); });

    expect(await screen.findByText('Andar 8')).toBeInTheDocument();
    expect(linhas()).toHaveLength(POR_PAGINA);
  });

  it('não anuncia lista vazia no meio da espera', async () => {
    render(<Tabela />);
    await screen.findByText('Andar 0');

    let entregar;
    api.get.mockImplementation(
      (url, config) => new Promise((resolve) => { entregar = () => resolve(pagina(url, config)); })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(screen.queryByText('Andar 0')).not.toBeInTheDocument());

    // A lista sem linhas durante a troca não é uma lista vazia — dizer isso
    // seria dar por encerrada uma busca que ainda está em curso.
    expect(screen.queryByText(/Nenhuma ocorrência/)).not.toBeInTheDocument();

    await act(async () => { entregar(); });
    await screen.findByText('Andar 8');
  });
});
