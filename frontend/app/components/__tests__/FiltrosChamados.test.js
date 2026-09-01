import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FiltrosChamados, useFiltrosChamados } from '@/app/components/FiltrosChamados';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

/**
 * A fileira de filtros da tela de finalizados.
 *
 * O que se cobre aqui é o mesmo do histórico ampliado: o recorte tem de chegar
 * ao servidor. Peneirar no cliente pareceria funcionar na primeira página e
 * mentiria em todas as outras — e nesta tela, que é de arquivo, quase nunca se
 * está na primeira.
 */
const BUILDING = 'p1';

function responder(url) {
  if (url.includes('/tickets')) {
    return Promise.resolve({ data: { tickets: [], total: 0, page: 1, limit: 30, pages: 0 } });
  }
  if (url.includes('/floors')) {
    return Promise.resolve({ data: { floors: [{ id: 'f1', label: '6º Andar' }, { id: 'f2', label: '5º Andar' }] } });
  }
  if (url.includes('/responsibles')) {
    return Promise.resolve({ data: [{ id: 'r1', name: 'Marina' }] });
  }
  return Promise.resolve({ data: {} });
}

/** Os parâmetros da última busca de chamados — o que a pergunta virou. */
function ultimaBusca() {
  const calls = api.get.mock.calls.filter(([url]) => url.includes('/tickets'));
  return calls.length ? calls[calls.length - 1][1]?.params : undefined;
}

/** A tela como ela é montada nas duas páginas: filtros acima, lista abaixo. */
function Tela() {
  const { filtros, setFiltros, params } = useFiltrosChamados();
  return (
    <>
      <FiltrosChamados buildingId={BUILDING} filtros={filtros} onChange={setFiltros} />
      <OcorrenciasTable
        buildingId={BUILDING}
        group="CONCLUIDOS"
        columns="CONCLUIDOS"
        filters={params}
        empty="Nenhum chamado finalizado ainda"
      />
    </>
  );
}

function renderTela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><Tela /></QueryClientProvider>);
}

/** Escolher numa das droplists de chip. */
async function escolher(user, filtro, opcao) {
  await user.click(screen.getByRole('combobox', { name: filtro }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(responder);
});

describe('FiltrosChamados', () => {
  it('manda o recorte ao servidor, sem perder o grupo da tela', async () => {
    const user = userEvent.setup();
    renderTela();

    await escolher(user, 'Tipo', 'Elétrica');

    await waitFor(() => expect(ultimaBusca()).toMatchObject({
      group: 'CONCLUIDOS',
      maintenance_type: 'ELETRICA',
      page: 1,
    }));
  });

  it('o andar vai como id, e não como o rótulo que a pessoa leu', async () => {
    const user = userEvent.setup();
    renderTela();

    await escolher(user, 'Andar', '6º Andar');

    await waitFor(() => expect(ultimaBusca()).toMatchObject({ floor_id: 'f1' }));
  });

  it('campo em branco não vira filtro vazio na consulta', async () => {
    // Mandar `floor_id=` faria o servidor recusar um uuid que ninguém escolheu.
    renderTela();

    await waitFor(() => expect(ultimaBusca()).toBeDefined());
    expect(ultimaBusca()).not.toHaveProperty('floor_id');
    expect(ultimaBusca()).not.toHaveProperty('date_from');
  });

  it('"Limpar" só existe quando há o que limpar, e devolve a lista inteira', async () => {
    const user = userEvent.setup();
    renderTela();

    expect(screen.queryByRole('button', { name: /Limpar/ })).not.toBeInTheDocument();

    await escolher(user, 'Prioridade', 'Alta');
    await waitFor(() => expect(ultimaBusca()).toMatchObject({ priority: 'ALTA' }));

    await user.click(screen.getByRole('button', { name: /Limpar/ }));

    await waitFor(() => expect(ultimaBusca()).not.toHaveProperty('priority'));
  });

  it('o chip mostra o nome do campo até alguém escolher, e daí o escolhido', async () => {
    // Quem carrega "Todos os responsáveis" a fileira inteira fica do tamanho da
    // frase mais comprida — e ela é justamente a que não diz nada.
    const user = userEvent.setup();
    renderTela();

    const chip = screen.getByRole('combobox', { name: 'Tipo' });
    expect(chip).toHaveTextContent('Tipo');

    await escolher(user, 'Tipo', 'Infiltração');

    expect(chip).toHaveTextContent('Infiltração');
  });

  it('a droplist devolve ao "todos" sem precisar do limpar', async () => {
    const user = userEvent.setup();
    renderTela();

    await escolher(user, 'Categoria', 'Corretiva');
    await waitFor(() => expect(ultimaBusca()).toMatchObject({ category: 'CORRETIVA' }));

    await escolher(user, 'Categoria', 'Todas as categorias');

    await waitFor(() => expect(ultimaBusca()).not.toHaveProperty('category'));
  });

  it('a lista vazia por filtro não diz que o prédio nunca fechou nada', async () => {
    const user = userEvent.setup();
    renderTela();

    await escolher(user, 'Tipo', 'Pintura');

    expect(await screen.findByText('Nenhuma ocorrência com esses filtros')).toBeInTheDocument();
  });

  /**
   * A ordem é o oitavo chip da fileira.
   *
   * A coluna que esta lista mostra é "Fechado em", e ela vinha ordenada por
   * criação: um chamado aberto em março e fechado ontem aparecia no fim, longe
   * de quem foi justamente procurar o que acabou de fechar.
   */
  describe('ordem', () => {
    it('abre no padrão, e o padrão não viaja — quem o aplica é o servidor', async () => {
      renderTela();

      await waitFor(() => expect(ultimaBusca()).toBeDefined());
      // O chip diz em que ordem se está lendo, mesmo sem ninguém ter escolhido.
      expect(screen.getByRole('combobox', { name: 'Ordem' })).toHaveTextContent('Fechado recentemente');
      expect(ultimaBusca()).not.toHaveProperty('sort');
    });

    it('a outra ponta vai ao servidor', async () => {
      const user = userEvent.setup();
      renderTela();

      await escolher(user, 'Ordem', 'Fechado há mais tempo');

      await waitFor(() => expect(ultimaBusca()).toMatchObject({
        group: 'CONCLUIDOS',
        sort: 'CLOSED_ASC',
      }));
    });

    it('"Limpar" devolve a ordem ao padrão junto com o resto', async () => {
      const user = userEvent.setup();
      renderTela();

      await escolher(user, 'Ordem', 'Fechado há mais tempo');
      await waitFor(() => expect(ultimaBusca()).toMatchObject({ sort: 'CLOSED_ASC' }));

      await user.click(screen.getByRole('button', { name: /Limpar/ }));

      await waitFor(() => expect(ultimaBusca()).not.toHaveProperty('sort'));
    });
  });
});
