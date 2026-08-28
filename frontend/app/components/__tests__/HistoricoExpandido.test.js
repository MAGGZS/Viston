import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmpliarHistorico, HistoricoCompleto } from '@/app/components/HistoricoExpandido';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: (...a) => push(...a) }) }));

/**
 * O histórico ampliado.
 *
 * O que se cobre aqui é o que ele existe para fazer: perguntar. O cartão do
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

/** Uma resposta por rota — a tela pede quatro coisas assim que abre. */
function responder(url) {
  if (url.includes('/history') || url === '/inspections') {
    return Promise.resolve({ data: { inspections: [VISTORIA], total: 1, page: 1, limit: 20, pages: 1 } });
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

function comQuery(children) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Os parâmetros da última chamada a uma rota — o que a pergunta virou. */
function ultimaChamada(trecho) {
  const calls = api.get.mock.calls.filter(([url]) => url.includes(trecho));
  return calls.length ? calls[calls.length - 1][1]?.params : undefined;
}

/** A tela larga é uma escolha do teste: por padrão o jsdom responde telefone. */
function comoDesktop(desktop) {
  window.matchMedia = (query) => ({
    matches: desktop && query.includes('min-width: 1024px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

const semLargura = window.matchMedia;

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(responder);
  push.mockClear();
  comoDesktop(false);
});

afterEach(() => {
  window.matchMedia = semLargura;
});

// ── O ícone do cartão ────────────────────────────────────────────────────────
describe('AmpliarHistorico', () => {
  const abrirIcone = () => screen.getByRole('button', { name: 'Ampliar o histórico' });

  it('no telefone leva para a tela própria, sem abrir caixa nenhuma', async () => {
    // Caixa é interrupção; a lista ampliada não interrompe nada — é para onde a
    // pessoa foi, e o voltar do aparelho tem de trazê-la de volta.
    render(comQuery(<AmpliarHistorico view="OCORRENCIAS" onSelectView={() => {}} buildingId={BUILDING} />));

    await userEvent.setup().click(abrirIcone());

    expect(push).toHaveBeenCalledWith('/historico/completo?view=OCORRENCIAS');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no computador abre a caixa sobre o cartão, sem sair da tela', async () => {
    comoDesktop(true);
    render(comQuery(<AmpliarHistorico view="VISTORIAS" onSelectView={() => {}} buildingId={BUILDING} />));

    await userEvent.setup().click(abrirIcone());

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('abre na leitura que estava aberta no cartão', async () => {
    comoDesktop(true);
    render(comQuery(<AmpliarHistorico view="OCORRENCIAS" onSelectView={() => {}} buildingId={BUILDING} />));

    await userEvent.setup().click(abrirIcone());

    const caixa = screen.getByRole('dialog');
    expect(within(caixa).getByRole('tab', { name: 'Ocorrências' })).toHaveAttribute('aria-selected', 'true');
  });

  it('fechada, não pede nada à rede', async () => {
    // O ícone mora no cabeçalho de três telas. Se a caixa consultasse antes de
    // ser aberta, todas elas pagariam quatro requisições por carregamento para
    // um resultado que ninguém abriu.
    comoDesktop(true);
    render(comQuery(<AmpliarHistorico view="VISTORIAS" onSelectView={() => {}} buildingId={BUILDING} />));

    await waitFor(() => expect(abrirIcone()).toBeInTheDocument());
    expect(api.get).not.toHaveBeenCalled();
  });
});

// ── O miolo, que serve à caixa e à tela ──────────────────────────────────────
/** O miolo com uma visão fixa — é assim que a caixa e a tela o usam. */
function Miolo({ view = 'VISTORIAS', isDesktop = false }) {
  return comQuery(<HistoricoCompleto view={view} buildingId={BUILDING} isDesktop={isDesktop} />);
}

/** O miolo com quem troca de visão por fora, como fazem as duas molduras. */
function MioloComAlternancia({ inicial = 'OCORRENCIAS' }) {
  const [view, setView] = useState(inicial);
  return comQuery(
    <>
      <button type="button" onClick={() => setView('VISTORIAS')}>ir para vistorias</button>
      <button type="button" onClick={() => setView('OCORRENCIAS')}>ir para ocorrências</button>
      <HistoricoCompleto view={view} buildingId={BUILDING} />
    </>
  );
}

const botaoFiltrar = () => screen.getByRole('button', { name: /^Filtrar/ });

async function abrirFiltros(user) {
  await user.click(botaoFiltrar());
  return screen.getByRole('dialog');
}

describe('busca', () => {
  it('procura pelo nome de quem vistoriou, e manda a busca ao servidor', async () => {
    const user = userEvent.setup();
    render(<Miolo />);

    await user.type(screen.getByLabelText('Procurar por quem vistoriou'), 'carlos');

    // O texto espera o dedo parar antes de virar consulta (ver
    // `useDebouncedValue`): o que se cobra é o pedido, não cada tecla.
    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ q: 'carlos' })));
  });

  it('nas ocorrências, procura no que foi descrito', async () => {
    const user = userEvent.setup();
    render(<Miolo view="OCORRENCIAS" />);

    await user.type(screen.getByLabelText('Procurar na descrição da ocorrência'), 'lâmpada');

    await waitFor(() => expect(ultimaChamada('/tickets')).toEqual(expect.objectContaining({ q: 'lâmpada' })));
  });

  it('lista vinte por página', async () => {
    render(<Miolo />);

    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ limit: 20, page: 1 })));
  });
});

describe('o ícone de filtros', () => {
  it('guarda os recortes atrás de si: nada de droplist solto na tela', async () => {
    render(<Miolo view="OCORRENCIAS" />);

    // Sem abrir a caixa, a tela tem a busca e o ícone — e mais nada.
    expect(screen.queryByRole('combobox', { name: 'Tipo' })).not.toBeInTheDocument();
    expect(botaoFiltrar()).toBeInTheDocument();
  });

  it('diz quantos estão valendo, e só depois de aplicados', async () => {
    const user = userEvent.setup();
    render(<Miolo view="OCORRENCIAS" />);

    expect(botaoFiltrar()).toHaveAccessibleName('Filtrar');

    const caixa = await abrirFiltros(user);
    await user.click(within(caixa).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Infiltração' }));

    // Escolhido, mas ainda não aplicado: o ícone continua limpo.
    expect(botaoFiltrar()).toHaveAccessibleName('Filtrar');

    await user.click(within(caixa).getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(botaoFiltrar()).toHaveAccessibleName('Filtrar — 1 filtro aplicado'));
  });

  it('só consulta quando o recorte é aplicado, e não a cada droplist tocado', async () => {
    const user = userEvent.setup();
    render(<Miolo view="OCORRENCIAS" />);

    await waitFor(() => expect(ultimaChamada('/tickets')).toBeDefined());
    const antes = api.get.mock.calls.filter(([url]) => url.includes('/tickets')).length;

    const caixa = await abrirFiltros(user);
    await user.click(within(caixa).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Infiltração' }));
    await user.click(within(caixa).getByRole('combobox', { name: 'Prioridade' }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));

    expect(api.get.mock.calls.filter(([url]) => url.includes('/tickets'))).toHaveLength(antes);

    await user.click(within(caixa).getByRole('button', { name: 'Aplicar' }));

    await waitFor(() =>
      expect(ultimaChamada('/tickets')).toEqual(
        expect.objectContaining({ maintenance_type: 'INFILTRACAO', priority: 'ALTA', group: 'TODOS' })
      )
    );
  });

  it('oferece os recortes da ocorrência, e não os da vistoria', async () => {
    const user = userEvent.setup();
    render(<Miolo view="OCORRENCIAS" />);
    const caixa = await abrirFiltros(user);

    for (const nome of ['Andar', 'Tipo', 'Categoria', 'Prioridade', 'Status', 'Responsável']) {
      expect(within(caixa).getByRole('combobox', { name: nome })).toBeInTheDocument();
    }
  });

  it('nas vistorias oferece só o que a vistoria tem: andar e período', async () => {
    const user = userEvent.setup();
    render(<Miolo />);
    const caixa = await abrirFiltros(user);

    expect(within(caixa).getByRole('combobox', { name: 'Andar' })).toBeInTheDocument();
    expect(within(caixa).queryByRole('combobox', { name: 'Prioridade' })).not.toBeInTheDocument();
    expect(within(caixa).getByLabelText('De')).toBeInTheDocument();
  });

  it('"limpar" devolve a lista inteira sem pedir confirmação de que limpou', async () => {
    const user = userEvent.setup();
    render(<Miolo />);

    let caixa = await abrirFiltros(user);
    await user.click(within(caixa).getByRole('combobox', { name: 'Andar' }));
    await user.click(await screen.findByRole('option', { name: '6º Andar' }));
    await user.click(within(caixa).getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => expect(ultimaChamada('/history')).toEqual(expect.objectContaining({ floor_id: 'f1' })));

    caixa = await abrirFiltros(user);
    await user.click(within(caixa).getByRole('button', { name: 'Limpar' }));

    await waitFor(() => expect(ultimaChamada('/history')).not.toHaveProperty('floor_id'));
    expect(botaoFiltrar()).toHaveAccessibleName('Filtrar');
  });

  it('não manda campo em branco: filtro vazio é ausência de filtro', async () => {
    render(<Miolo />);

    await waitFor(() => expect(ultimaChamada('/history')).toBeDefined());
    const params = ultimaChamada('/history');
    expect(params).not.toHaveProperty('q');
    expect(params).not.toHaveProperty('floor_id');
    expect(params).not.toHaveProperty('date_from');
  });

  it('guarda o recorte de cada visão ao alternar entre elas', async () => {
    // Quem afunilou as ocorrências e foi conferir as vistorias volta para o que
    // deixou: refazer seis droplists é o que a tela veio evitar.
    const user = userEvent.setup();
    render(<MioloComAlternancia />);

    const caixa = await abrirFiltros(user);
    await user.click(within(caixa).getByRole('combobox', { name: 'Prioridade' }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));
    await user.click(within(caixa).getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(ultimaChamada('/tickets')).toEqual(expect.objectContaining({ priority: 'ALTA' })));

    await user.click(screen.getByRole('button', { name: 'ir para vistorias' }));
    await waitFor(() => expect(botaoFiltrar()).toHaveAccessibleName('Filtrar'));

    await user.click(screen.getByRole('button', { name: 'ir para ocorrências' }));
    expect(botaoFiltrar()).toHaveAccessibleName('Filtrar — 1 filtro aplicado');
  });
});

describe('na tela larga', () => {
  it('lista as vistorias em tabela, com o status e a contagem que o cartão não cabia', async () => {
    comoDesktop(true);
    render(<Miolo isDesktop />);

    const linha = (await screen.findByText('Carlos Andrade')).closest('tr');
    expect(within(linha).getByText('20/08/2026')).toBeInTheDocument();
    // Duas ocorrências, e nenhuma delas grave: o andar saiu OK.
    expect(within(linha).getByText('2')).toBeInTheDocument();
    expect(within(linha).getByText('OK')).toBeInTheDocument();
  });

  it('a vistoria fala pelo pior dos andares dela', async () => {
    // Dez andares em ordem e um com problema não é uma vistoria OK — é
    // justamente esse andar que alguém veio achar na lista.
    api.get.mockImplementation((url) => {
      if (url.includes('/history')) {
        return Promise.resolve({
          data: {
            inspections: [{
              ...VISTORIA,
              floor_form_entries: [
                { floor_id: 'f1', status_geral: 'OK', floor: { label: '6º' }, _count: { maintenance_records: 0 } },
                { floor_id: 'f2', status_geral: 'PROBLEMA', floor: { label: '5º' }, _count: { maintenance_records: 3 } },
                { floor_id: 'f3', status_geral: 'ATENCAO', floor: { label: '4º' }, _count: { maintenance_records: 1 } },
              ],
            }],
            total: 1, page: 1, limit: 20, pages: 1,
          },
        });
      }
      return responder(url);
    });

    comoDesktop(true);
    render(<Miolo isDesktop />);

    const linha = (await screen.findByText('Carlos Andrade')).closest('tr');
    expect(within(linha).getByText('Problema')).toBeInTheDocument();
    // E a contagem é a soma dos andares, não a do pior deles.
    expect(within(linha).getByText('4')).toBeInTheDocument();
  });

});

describe('no telefone', () => {
  it('o cartão da vistoria troca os andares pelo status', async () => {
    render(<Miolo />);

    await screen.findByText('Carlos Andrade');
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('2 ocorrências')).toBeInTheDocument();
    expect(screen.queryByText(/andar\(es\)/)).not.toBeInTheDocument();
  });
});
