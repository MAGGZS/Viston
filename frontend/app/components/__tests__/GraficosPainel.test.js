import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OcorrenciasPorStatus } from '@/app/components/OcorrenciasPorStatus';
import { OcorrenciasPorCategoria } from '@/app/components/OcorrenciasPorCategoria';
import { intervaloDe } from '@/app/lib/periodo';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import api from '../../lib/api';

/**
 * Os dois gráficos do painel do moderador.
 *
 * O que se cobre aqui é o que eles existem para dizer. Primeiro o período: "até
 * hoje" é a única regra que o produto inventou — vai do primeiro de janeiro do
 * ano escolhido até o dia em que a pessoa está olhando —, e ela erra sozinha na
 * virada do fuso. Depois as contagens: elas vêm somadas do servidor, e uma soma
 * feita sobre a página que a tela carregou mentiria em qualquer prédio grande.
 */
const BUILDING = 'p1';

const RESUMO = {
  by_status: {
    ABERTO: 4,
    ENCAMINHADO: 5,
    EM_ANDAMENTO: 3,
    AGUARDANDO_TERCEIRO: 1,
    AGUARDANDO_FECHAMENTO: 2,
    CONCLUIDO: 7,
  },
  by_category: { PREVENTIVA: 8, CORRETIVA: 9, EMERGENCIAL: 3, EVENTOS: 1, PROJETOS: 1 },
  total: 22,
};

function responder(url) {
  if (url.includes('/tickets/summary')) return Promise.resolve({ data: RESUMO });
  return Promise.resolve({ data: {} });
}

/** Os parâmetros da última busca de resumo — o período que a tela pediu. */
function ultimoPeriodo() {
  const calls = api.get.mock.calls.filter(([url]) => url.includes('/tickets/summary'));
  return calls.length ? calls[calls.length - 1][1]?.params : undefined;
}

function renderCard(node) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(responder);
});

// ── A regra do período ────────────────────────────────────────────────────────
describe('intervaloDe', () => {
  it('"até hoje" vai do primeiro de janeiro do ano escolhido ao dia de hoje', () => {
    const hoje = new Date(2026, 7, 29); // 29 de agosto de 2026, hora local

    expect(intervaloDe({ year: 2026, month: '' }, hoje)).toEqual({
      date_from: '2026-01-01',
      date_to: '2026-08-29',
    });
  });

  it('num ano passado, "até hoje" continua terminando hoje — e não em dezembro', () => {
    // É o que o pedido diz: soma desde o ano escolhido até o dia em que a
    // pessoa vê o gráfico. Fechar em 31/12 seria outro recorte.
    const hoje = new Date(2026, 7, 29);

    expect(intervaloDe({ year: 2024, month: '' }, hoje)).toEqual({
      date_from: '2024-01-01',
      date_to: '2026-08-29',
    });
  });

  it('o mês escolhido fecha no último dia dele, inclusive em fevereiro bissexto', () => {
    expect(intervaloDe({ year: 2026, month: '2' })).toEqual({
      date_from: '2026-02-01',
      date_to: '2026-02-28',
    });
    expect(intervaloDe({ year: 2024, month: '2' })).toEqual({
      date_from: '2024-02-01',
      date_to: '2024-02-29',
    });
  });

  it('o dia de hoje é o do calendário local, e não o do relógio UTC', () => {
    // 29 de agosto às 22h em São Paulo já é dia 30 em UTC. Pelo `toISOString`
    // o gráfico passaria a somar um dia que ainda não aconteceu.
    const noite = new Date(2026, 7, 29, 22, 30);

    expect(intervaloDe({ year: 2026, month: '' }, noite).date_to).toBe('2026-08-29');
  });
});

// ── A pizza ───────────────────────────────────────────────────────────────────
describe('OcorrenciasPorStatus', () => {
  it('abre no ano corrente até hoje, sem ninguém escolher nada', async () => {
    renderCard(<OcorrenciasPorStatus buildingId={BUILDING} />);

    const ano = new Date().getFullYear();
    await waitFor(() => expect(ultimoPeriodo()?.date_from).toBe(`${ano}-01-01`));
  });

  it('junta execução numa fatia só e deixa a decisão do moderador à parte', async () => {
    // EM_ANDAMENTO + AGUARDANDO_TERCEIRO são o mesmo momento para quem olha de
    // fora — 3 + 1. AGUARDANDO_FECHAMENTO não entra: não é execução, é decisão
    // parada com o moderador, que é o que ele abre esta tela para ver.
    renderCard(<OcorrenciasPorStatus buildingId={BUILDING} />);

    const andamento = await screen.findByText('Em andamento');
    expect(within(andamento.closest('li')).getByText('4')).toBeInTheDocument();

    const aguardando = screen.getByText('Concluído pelo responsável');
    expect(within(aguardando.closest('li')).getByText('2')).toBeInTheDocument();
  });

  it('o total é o do servidor, e não a soma das fatias desenhadas', async () => {
    renderCard(<OcorrenciasPorStatus buildingId={BUILDING} />);

    expect(await screen.findByLabelText(/22 no total/)).toBeInTheDocument();
  });

  it('trocar o mês manda outro período ao servidor', async () => {
    const user = userEvent.setup();
    renderCard(<OcorrenciasPorStatus buildingId={BUILDING} />);
    await screen.findByText('Finalizado');

    await user.click(screen.getByRole('combobox', { name: 'Mês' }));
    await user.click(await screen.findByRole('option', { name: 'Março' }));

    const ano = new Date().getFullYear();
    await waitFor(() =>
      expect(ultimoPeriodo()).toEqual({ date_from: `${ano}-03-01`, date_to: `${ano}-03-31` })
    );
  });

  it('período sem ocorrência nenhuma não desenha rosca vazia', async () => {
    api.get.mockImplementation(() =>
      Promise.resolve({ data: { by_status: {}, by_category: {}, total: 0 } })
    );
    renderCard(<OcorrenciasPorStatus buildingId={BUILDING} />);

    expect(await screen.findByText('Nenhuma ocorrência neste período')).toBeInTheDocument();
  });
});

// ── As barras ─────────────────────────────────────────────────────────────────
describe('OcorrenciasPorCategoria', () => {
  it('ordena da categoria que mais pesou para a que menos', async () => {
    renderCard(<OcorrenciasPorCategoria buildingId={BUILDING} />);

    await screen.findByText('Corretiva');
    const nomes = screen.getAllByRole('listitem').map((li) => li.textContent);

    expect(nomes[0]).toContain('Corretiva');
    expect(nomes[1]).toContain('Preventiva');
    expect(nomes[2]).toContain('Emergencial');
  });

  it('tem período próprio: mexer aqui não mexe no gráfico do lado', async () => {
    const user = userEvent.setup();
    renderCard(
      <>
        <OcorrenciasPorStatus buildingId={BUILDING} />
        <OcorrenciasPorCategoria buildingId={BUILDING} />
      </>
    );
    await screen.findByText('Corretiva');

    // O segundo cartão é o das categorias — os dois trazem o mesmo par de chips.
    const meses = screen.getAllByRole('combobox', { name: 'Mês' });
    await user.click(meses[1]);
    await user.click(await screen.findByRole('option', { name: 'Maio' }));

    const ano = new Date().getFullYear();
    await waitFor(() => expect(ultimoPeriodo()?.date_from).toBe(`${ano}-05-01`));

    // O da pizza continua onde estava: ainda pede o ano inteiro até hoje.
    const daPizza = api.get.mock.calls
      .filter(([url]) => url.includes('/tickets/summary'))
      .map(([, cfg]) => cfg?.params?.date_from);
    expect(daPizza).toContain(`${ano}-01-01`);
  });
});
