import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmpliarHistorico } from '@/app/components/HistoricoExpandido';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

/**
 * O histórico ampliado.
 *
 * O que se cobre aqui é o que a caixa existe para fazer: perguntar. O cartão do
 * painel já listava — o que ele não fazia era responder "o que o Carlos
 * vistoriou" ou "quais infiltrações do 6º andar ainda estão abertas", e essas
 * perguntas só valem se chegarem ao servidor como filtro, e não como uma
 * peneira no punhado de linhas que a página trouxe.
 *
 * Daí os testes olharem os parâmetros da requisição: filtrar no cliente
 * pareceria funcionar na primeira página e mentiria em todas as outras.
 */
const BUILDING = 'p1';

const VISTORIA = {
  id: 'v1',
  date: '2026-08-20',
  inspector: { id: 'i1', name: 'Carlos Andrade' },
  floor_form_entries: [
    { floor_id: 'f1', status_geral: 'OK', floor: { label: '6º Andar' }, _count: { maintenance_records: 2 } },
  ],
  has_excel: false,
};

/** Uma resposta por rota — a caixa pede quatro coisas assim que abre. */
function responder(url, config = {}) {
  if (url.includes('/history') || url === '/inspections') {
    return Promise.resolve({
      data: { inspections: [VISTORIA], total: 1, page: 1, limit: 20, pages: 1 },
    });
  }
  if (url.includes('/tickets')) {
    return Promise.resolve({ data: { tickets: [], total: 0, page: 1, limit: 20, pages: 0 } });
  }
  if (url.includes('/floors')) {
    return Promise.resolve({ data: { floors: [{ id: 'f1', label: '6º Andar' }, { id: 'f2', label: '5º Andar' }] } });
  }
  if (url.includes('/responsibles')) {
    return Promise.resolve({ data: [{ id: 'r1', name: 'Marina' }] });
  }
  return Promise.resolve({ data: {} });
}

/** O cartão de fora, reduzido ao que a caixa precisa dele: a visão escolhida. */
function Cartao({ inicial = 'VISTORIAS' }) {
  const [view, setView] = useState(inicial);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  return (
    <QueryClientProvider client={client}>
      <AmpliarHistorico view={view} onSelectView={setView} buildingId={BUILDING} />
    </QueryClientProvider>
  );
}

/** Os parâmetros da última chamada a uma rota — o que a pergunta virou. */
function ultimaChamada(trecho) {
  const calls = api.get.mock.calls.filter(([url]) => url.includes(trecho));
  return calls.length ? calls[calls.length - 1][1]?.params : undefined;
}

async function abrir(props = {}) {
  const user = userEvent.setup();
  render(<Cartao {...props} />);
  await user.click(screen.getByRole('button', { name: 'Ampliar o histórico' }));
  return user;
}

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(responder);
});

describe('AmpliarHistorico', () => {
  it('só abre a caixa quando o ícone é acionado', async () => {
    render(<Cartao />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ampliar o histórico' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('fechada, não pede nada à rede', async () => {
    // O ícone mora no cabeçalho de três telas. Se a caixa consultasse antes de
    // ser aberta, todas elas pagariam quatro requisições por carregamento para
    // um resultado que ninguém pediu.
    render(<Cartao />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ampliar o histórico' })).toBeInTheDocument());
    expect(api.get).not.toHaveBeenCalled();
  });

  it('abre no histórico que estava aberto no cartão', async () => {
    await abrir({ inicial: 'OCORRENCIAS' });

    const caixa = screen.getByRole('dialog');
    expect(within(caixa).getByRole('tab', { name: 'Ocorrências' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lista as vistorias do prédio, vinte por página', async () => {
    await abrir();

    await waitFor(() => expect(screen.getByText('Carlos Andrade')).toBeInTheDocument());
    expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ limit: 20, page: 1 }));
  });
});

describe('filtros das vistorias', () => {
  it('procura pelo nome de quem vistoriou, e manda a busca ao servidor', async () => {
    const user = await abrir();

    await user.type(screen.getByLabelText('Procurar por quem vistoriou'), 'carlos');

    // O texto espera o dedo parar antes de virar consulta (ver
    // `useDebouncedValue`): o que se cobra é o pedido, não cada tecla.
    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ q: 'carlos' })));
  });

  it('filtra por andar', async () => {
    const user = await abrir();

    await user.click(await screen.findByRole('combobox', { name: 'Andar' }));
    await user.click(await screen.findByRole('option', { name: '6º Andar' }));

    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ floor_id: 'f1' })));
  });

  it('não manda campo em branco: filtro vazio é ausência de filtro', async () => {
    await abrir();

    await waitFor(() => expect(ultimaChamada('/history')).toBeDefined());
    const params = ultimaChamada('/history');
    expect(params).not.toHaveProperty('q');
    expect(params).not.toHaveProperty('floor_id');
    expect(params).not.toHaveProperty('date_from');
  });

  it('limpa tudo de uma vez, e o "limpar" só existe quando há o que limpar', async () => {
    const user = await abrir();

    expect(screen.queryByRole('button', { name: /Limpar filtros/ })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Procurar por quem vistoriou'), 'carlos');
    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ q: 'carlos' })));

    await user.click(screen.getByRole('button', { name: /Limpar filtros/ }));

    await waitFor(() => expect(ultimaChamada('/history')).not.toHaveProperty('q'));
    expect(screen.getByLabelText('Procurar por quem vistoriou')).toHaveValue('');
  });
});

describe('filtros das ocorrências', () => {
  it('oferece os recortes da ocorrência, e não os da vistoria', async () => {
    await abrir({ inicial: 'OCORRENCIAS' });

    for (const nome of ['Andar', 'Tipo', 'Categoria', 'Prioridade', 'Status', 'Responsável']) {
      expect(await screen.findByRole('combobox', { name: nome })).toBeInTheDocument();
    }
  });

  it('leva tipo e status ao servidor, somados na mesma consulta', async () => {
    const user = await abrir({ inicial: 'OCORRENCIAS' });

    await user.click(await screen.findByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Infiltração' }));

    await user.click(await screen.findByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Aberto' }));

    await waitFor(() =>
      expect(ultimaChamada('/tickets')).toEqual(
        expect.objectContaining({ maintenance_type: 'INFILTRACAO', status: 'ABERTO', group: 'TODOS' })
      )
    );
  });

  it('procura no que foi descrito', async () => {
    const user = await abrir({ inicial: 'OCORRENCIAS' });

    await user.type(screen.getByLabelText('Procurar na descrição da ocorrência'), 'lâmpada');

    await waitFor(() => expect(ultimaChamada('/tickets')).toEqual(expect.objectContaining({ q: 'lâmpada' })));
  });

  it('guarda o recorte de cada visão ao alternar entre elas', async () => {
    // Quem afunilou as ocorrências e foi conferir as vistorias volta para o que
    // deixou: refazer seis droplists é o que a caixa veio evitar.
    const user = await abrir({ inicial: 'OCORRENCIAS' });

    await user.click(await screen.findByRole('combobox', { name: 'Prioridade' }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));
    await waitFor(() => expect(ultimaChamada('/tickets')).toEqual(expect.objectContaining({ priority: 'ALTA' })));

    const caixa = screen.getByRole('dialog');
    await user.click(within(caixa).getByRole('tab', { name: 'Vistorias' }));
    await waitFor(() => expect(ultimaChamada('/history')).not.toHaveProperty('priority'));

    await user.click(within(caixa).getByRole('tab', { name: 'Ocorrências' }));
    expect(await screen.findByRole('combobox', { name: 'Prioridade' })).toHaveTextContent('Alta');
  });
});

/**
 * A mesma caixa na tela larga.
 *
 * O corte é o do produto inteiro (1024px, ver `useIsDesktop`), e o que muda é a
 * forma da lista: tabela onde há largura, cartão onde não há. Os filtros e a
 * consulta são os mesmos — o que se cobre aqui é que a tabela existe e que ela
 * é a mesma lista.
 */
describe('na tela larga', () => {
  const semDesktop = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  });

  afterEach(() => {
    window.matchMedia = semDesktop;
  });

  it('lista as vistorias em tabela, com as contagens que o cartão não cabia', async () => {
    await abrir();

    const linha = (await screen.findByText('Carlos Andrade')).closest('tr');
    expect(within(linha).getByText('20/08/2026')).toBeInTheDocument();
    // Um andar, duas ocorrências: as duas colunas que a tela ampliada ganhou.
    expect(within(linha).getAllByText('1')).not.toHaveLength(0);
    expect(within(linha).getByText('2')).toBeInTheDocument();
  });

  it('a busca continua indo ao servidor, como na tela estreita', async () => {
    const user = await abrir();

    await user.type(screen.getByLabelText('Procurar por quem vistoriou'), 'carlos');

    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ q: 'carlos' })));
  });
});
