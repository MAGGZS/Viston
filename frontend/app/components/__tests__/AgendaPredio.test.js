import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useToastStore } from '@/app/store/toast';
import { AgendaPredio } from '@/app/components/agenda/AgendaPredio';
import { motivoDaSugestao, validarAgendamento } from '@/app/components/agenda/FormularioAgendamento';

/**
 * A agenda do prédio (gestor e visualizador).
 *
 * O que se prende aqui é o que quebraria calado: o painel da direita alternar
 * entre a lista e o formulário sem perder o calendário, o prazo antes da data
 * ser barrado ali mesmo, a sugestão vir no topo e já marcada, e o lápis abrir
 * a edição do agendamento certo.
 */

const mockCreate = jest.fn();
const mockUpdate = jest.fn();

const mockSchedules = [
  {
    id: 's1', building_id: 'p1', inspector: { id: 'i1', name: 'Carlos Andrade' },
    scheduled_date: '2026-10-10', due_date: '2026-10-15', status: 'PENDENTE', overdue: false,
    floors: [{ id: 'f1', label: '3º Andar' }], notes: null,
  },
  {
    id: 's2', building_id: 'p1', inspector: { id: 'i2', name: 'Beatriz Lima' },
    scheduled_date: '2026-10-02', due_date: '2026-10-05', status: 'PENDENTE', overdue: true,
    floors: [{ id: 'f2', label: '2º Andar' }], notes: null,
  },
  {
    id: 's3', building_id: 'p1', inspector: { id: 'i1', name: 'Carlos Andrade' },
    scheduled_date: '2026-10-01', due_date: '2026-10-03', status: 'CONCLUIDO', overdue: false,
    floors: [{ id: 'f1', label: '3º Andar' }], notes: null,
  },
];

// Os atrasados de todos os meses — o alerta do topo. Um de setembro (fora do
// mês aberto) com prazo vencido, e o de outubro só atrasado.
let mockAtrasados = [];
const ATRASADOS = [
  {
    id: 's9', building_id: 'p1', inspector: { id: 'i3', name: 'Diego Souza' },
    scheduled_date: '2026-09-20', due_date: '2026-09-25', status: 'PENDENTE', overdue: true, past_deadline: true,
    floors: [{ id: 'f1', label: '3º Andar' }], notes: null,
  },
  {
    id: 's2', building_id: 'p1', inspector: { id: 'i2', name: 'Beatriz Lima' },
    scheduled_date: '2026-10-02', due_date: '2026-10-05', status: 'PENDENTE', overdue: true,
    floors: [{ id: 'f2', label: '2º Andar' }], notes: null,
  },
];

const mockSuggestion = [
  { id: 'i2', name: 'Beatriz Lima', pending_count: 0, last_inspected_at: null, suggested: true },
  { id: 'i1', name: 'Carlos Andrade', pending_count: 2, last_inspected_at: '2026-09-01', suggested: false },
];

// Os abertos de todos os meses (`status: 'PENDENTE'`), de onde saem os que
// ficaram sem inspetor. `mockFalhaDoMes` faz a consulta do mês falhar.
let mockPendentes = [];
let mockFalhaDoMes = false;

jest.mock('../../hooks/useApi', () => ({
  useBuildingSchedules: (_id, filtros = {}) =>
    filtros.status === 'PENDENTE'
      ? { data: { schedules: mockPendentes }, isLoading: false, isError: false }
      : mockFalhaDoMes
        ? { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: jest.fn() }
        : { data: { schedules: mockSchedules }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() },
  useOverdueSchedules: () => ({ data: { schedules: mockAtrasados } }),
  useFloors: () => ({
    data: { floors: [{ id: 'f2', label: '2º Andar' }, { id: 'f1', label: '3º Andar' }] },
    isLoading: false,
  }),
  useScheduleSuggestion: (_id, { floorIds }) =>
    floorIds.length
      ? { data: { inspectors: mockSuggestion }, isFetching: false, isError: false }
      : { data: undefined, isFetching: false, isError: false },
  useCreateSchedule: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateSchedule: () => ({ mutate: mockUpdate, isPending: false }),
}));

const painel = () => screen.getByRole('complementary', { name: 'Agendamentos' });
const dia = (container, key) => container.querySelector(`[data-date="${key}"]`);

let user;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0, 0) });
  user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  mockAtrasados = [];
  mockPendentes = [];
  mockFalhaDoMes = false;
  useToastStore.setState({ toasts: [] });
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('AgendaPredio', () => {
  it('abre com a lista do mês no painel, e o filtro recorta por status', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);

    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
    expect(within(painel()).getAllByText('Carlos Andrade')).toHaveLength(2);
    expect(within(painel()).getByText('Beatriz Lima')).toBeInTheDocument();

    await user.click(within(painel()).getByRole('button', { name: /Atrasados/ }));
    expect(within(painel()).getByText('Beatriz Lima')).toBeInTheDocument();
    expect(within(painel()).queryByText('Carlos Andrade')).not.toBeInTheDocument();
  });

  it('troca a lista pelo formulário ao clicar num dia, mostrando o que já está marcado nele, e volta', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);

    await user.click(dia(container, '2026-10-10'));

    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
    expect(within(painel()).getByText(/Já agendado neste dia/)).toBeInTheDocument();
    expect(within(painel()).getByLabelText('Data da vistoria')).toHaveValue('2026-10-10');
    // O prazo padrão é uma semana depois.
    expect(within(painel()).getByLabelText('Até quando')).toHaveValue('2026-10-17');
    expect(within(painel()).queryByRole('heading', { name: 'Agendamentos do mês' })).not.toBeInTheDocument();

    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
  });

  it('"Agendar" abre o formulário com hoje escolhido', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(screen.getByRole('button', { name: /Agendar/ }));
    expect(within(painel()).getByLabelText('Data da vistoria')).toHaveValue('2026-10-07');
  });

  it('dia que já passou mostra a agenda dele, sem formulário', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-02'));
    expect(within(painel()).getByRole('heading', { name: 'Agenda do dia' })).toBeInTheDocument();
    expect(within(painel()).queryByRole('form')).not.toBeInTheDocument();
  });

  it('barra o prazo antes da data ali mesmo, sem esperar o envio', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));

    const prazo = within(painel()).getByLabelText('Até quando');
    await user.clear(prazo);
    await user.type(prazo, '2026-10-08');

    expect(within(painel()).getByRole('alert')).toHaveTextContent('O prazo não pode ser antes da data agendada');
    await user.click(within(painel()).getByRole('button', { name: 'Agendar vistoria' }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('pede os andares antes de sugerir, e põe o sugerido no topo, já marcado', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));

    expect(within(painel()).getByText(/Escolha os andares primeiro/)).toBeInTheDocument();
    expect(within(painel()).queryAllByRole('radio')).toHaveLength(0);

    await user.click(within(painel()).getByRole('button', { name: '3º Andar' }));

    const opcoes = within(painel()).getAllByRole('radio');
    expect(opcoes[0]).toHaveTextContent('Beatriz Lima');
    expect(opcoes[0]).toHaveTextContent('Sugerido');
    expect(opcoes[0]).toHaveTextContent('Nenhuma vistoria pendente no período');
    expect(opcoes[0]).toHaveAttribute('aria-checked', 'true');
    expect(opcoes[1]).toHaveTextContent('2 pendentes');

    await user.click(within(painel()).getByRole('button', { name: 'Agendar vistoria' }));
    expect(mockCreate).toHaveBeenCalledWith(
      {
        buildingId: 'p1', inspector_id: 'i2', scheduled_date: '2026-10-10', due_date: '2026-10-17',
        floor_ids: ['f1'], notes: null,
      },
      expect.any(Object)
    );
  });

  it('o lápis abre a edição daquele agendamento, e cancelar pede confirmação', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);

    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));

    expect(within(painel()).getByRole('heading', { name: 'Editar agendamento' })).toBeInTheDocument();
    expect(within(painel()).getByLabelText('Data da vistoria')).toHaveValue('2026-10-02');
    expect(within(painel()).getByLabelText('Até quando')).toHaveValue('2026-10-05');
    expect(within(painel()).getByRole('button', { name: '2º Andar' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(painel()).getByRole('button', { name: /Cancelar agendamento/ }));
    const caixa = screen.getByRole('dialog');
    await user.click(within(caixa).getByRole('button', { name: 'Cancelar agendamento' }));
    expect(mockUpdate).toHaveBeenCalledWith(
      { buildingId: 'p1', scheduleId: 's2', status: 'CANCELADO' },
      expect.any(Object)
    );
  });

  it('sem permissão de escrita não oferece "Agendar" nem lápis', () => {
    render(<AgendaPredio buildingId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /Agendar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar agendamento de/ })).not.toBeInTheDocument();
  });

  it('sem atrasados, o alerta do topo não aparece', () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    expect(screen.queryByRole('region', { name: 'Vistorias atrasadas' })).not.toBeInTheDocument();
  });

  it('alerta fixo conta os atrasados de qualquer mês e abre a lista; o item leva o calendário ao dia', async () => {
    mockAtrasados = ATRASADOS;
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);

    const alerta = screen.getByRole('region', { name: 'Vistorias atrasadas' });
    // Persistente: não é role="alert", que gritaria a cada nova busca.
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(within(alerta).getByText('2 vistorias atrasadas')).toBeInTheDocument();
    expect(within(alerta).getByText(/1 com prazo vencido/)).toBeInTheDocument();

    const abrir = within(alerta).getByRole('button', { name: /Ver atrasadas/ });
    expect(abrir).toHaveAttribute('aria-expanded', 'false');
    await user.click(abrir);
    expect(within(alerta).getByRole('button', { name: /Ocultar/ })).toHaveAttribute('aria-expanded', 'true');

    // Prazo vencido antes do só atrasado; quem pode editar tem o lápis.
    const linhas = within(alerta).getAllByRole('listitem');
    expect(linhas[0]).toHaveTextContent('Diego Souza');
    expect(linhas[0]).toHaveTextContent('Prazo vencido');
    expect(linhas[1]).toHaveTextContent('Atrasado');
    expect(within(alerta).getAllByRole('button', { name: /^Editar agendamento de/ })).toHaveLength(2);

    // O de setembro leva o calendário para setembro, no dia dele.
    await user.click(within(linhas[0]).getByRole('button', { name: /^Diego Souza/ }));
    expect(screen.getByRole('grid', { name: /Setembro 2026/ })).toBeInTheDocument();
    expect(dia(container, '2026-09-20')).toHaveClass('is-selecionado');
    expect(within(painel()).getByRole('heading', { name: 'Agenda do dia' })).toBeInTheDocument();
  });

  it('prédio inativo deixa "Agendar" desligado e avisa', () => {
    render(<AgendaPredio buildingId="p1" canEdit frozen />);
    expect(screen.getByRole('button', { name: /Agendar/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Prédio inativo');
  });
});

describe('AgendaPredio: painel, foco e avisos', () => {
  it('com a edição aberta, clicar noutro dia só troca a data e a edição não se perde', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));
    await user.type(within(painel()).getByLabelText('Observação (opcional)'), 'trazer a chave');

    await user.click(dia(container, '2026-10-20'));

    expect(within(painel()).getByRole('heading', { name: 'Editar agendamento' })).toBeInTheDocument();
    expect(within(painel()).getByLabelText('Data da vistoria')).toHaveValue('2026-10-20');
    expect(within(painel()).getByLabelText('Observação (opcional)')).toHaveValue('trazer a chave');
  });

  it('com o formulário novo aberto, dia passado não o fecha: o campo diz por quê', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    await user.click(dia(container, '2026-10-02'));

    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
    const data = within(painel()).getByLabelText('Data da vistoria');
    expect(data).toHaveValue('2026-10-10');
    expect(data).toHaveAttribute('aria-invalid', 'true');
    expect(within(painel()).getByRole('alert')).toHaveTextContent('A data não pode estar no passado');

    // Um dia válido apaga o aviso.
    await user.click(dia(container, '2026-10-12'));
    expect(within(painel()).queryByText('A data não pode estar no passado')).not.toBeInTheDocument();
  });

  it('com a consulta do mês falhando, o cabeçalho não diz "0 agendamentos"', () => {
    mockFalhaDoMes = true;
    render(<AgendaPredio buildingId="p1" canEdit />);
    expect(screen.getByText('Não foi possível carregar a agenda')).toBeInTheDocument();
    expect(screen.queryByText(/0 agendamentos/)).not.toBeInTheDocument();
  });

  it('a troca do painel leva o foco ao título, e a volta devolve à linha de origem', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));

    expect(within(painel()).getByRole('heading', { name: 'Editar agendamento' })).toHaveFocus();

    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    const deVolta = within(painel()).getByText('2º Andar').closest('li');
    expect(within(deVolta).getAllByRole('button')[0]).toHaveFocus();
  });

  it('"Agendar" leva o foco ao título, e voltar devolve ao botão', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    const agendar = screen.getByRole('button', { name: /Agendar/ });
    await user.click(agendar);
    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toHaveFocus();
    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    expect(agendar).toHaveFocus();
  });

  it('a faixa do topo conta e lista os que ficaram sem inspetor; o lápis abre a edição com o sugerido', async () => {
    mockPendentes = [{ ...mockSchedules[0], inspector_left: true }];
    render(<AgendaPredio buildingId="p1" canEdit />);

    const faixa = screen.getByRole('region', { name: 'Agendamentos que pedem atenção' });
    expect(within(faixa).getByText(/1 sem inspetor/)).toBeInTheDocument();
    await user.click(within(faixa).getByRole('button', { name: /Ver lista/ }));
    expect(within(faixa).getByText('Inspetor saiu')).toBeInTheDocument();

    await user.click(within(faixa).getByRole('button', { name: /^Editar agendamento de Carlos Andrade/ }));
    expect(within(painel()).getByRole('heading', { name: 'Editar agendamento' })).toBeInTheDocument();
    const opcoes = within(painel()).getAllByRole('radio');
    // O sugerido vem marcado, e não quem saiu.
    expect(opcoes[0]).toHaveTextContent('Beatriz Lima');
    expect(opcoes[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('409 ao salvar: avisa e volta para a lista, sem modal de plano', async () => {
    mockUpdate.mockImplementation((_vars, { onError }) =>
      onError({ response: { status: 409, data: { error: { message: 'O agendamento mudou. Recarregue e tente de novo.' } } } })
    );
    render(<AgendaPredio buildingId="p1" canEdit />);
    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));
    await user.type(within(painel()).getByLabelText('Observação (opcional)'), 'x');
    await user.click(within(painel()).getByRole('button', { name: 'Salvar alterações' }));

    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      message: 'O agendamento mudou. Recarregue e tente de novo.', type: 'error', detail: null,
    });
  });

  it('passa no axe com a lista e com o formulário aberto', async () => {
    // O axe espera timers de verdade.
    jest.useRealTimers();
    const u = userEvent.setup();
    try {
      const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
      expect(await axe(container)).toHaveNoViolations();
      await u.click(dia(container, '2099-01-10') ?? screen.getByRole('button', { name: /Agendar/ }));
      await u.click(within(painel()).getByRole('button', { name: '3º Andar' }));
      expect(await axe(container)).toHaveNoViolations();
    } finally {
      jest.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0, 0) });
    }
  }, 20000);
});

describe('regras do formulário', () => {
  it('explica a sugestão pelo critério que decidiu', () => {
    const hoje = new Date(2026, 9, 7);
    const a = { id: 'a', pending_count: 1, last_inspected_at: '2026-09-27', suggested: true };
    const b = { id: 'b', pending_count: 1, last_inspected_at: '2026-10-01' };
    expect(motivoDaSugestao(a, [a, b], hoje)).toBe('Não vistoria esses andares há 10 dias');
    expect(motivoDaSugestao({ ...a, last_inspected_at: null }, [a, b], hoje)).toBe('Nunca vistoriou esses andares');
    expect(motivoDaSugestao(a, [a, { ...b, pending_count: 3 }], hoje)).toBe('Menos vistorias pendentes no período');
    expect(motivoDaSugestao(a, [a], hoje)).toBe('Único inspetor do prédio');
  });

  it('valida campos obrigatórios e o prazo', () => {
    expect(validarAgendamento({ date: '2026-10-10', dueDate: '2026-10-09', floorIds: [], inspectorId: null, hoje: '2026-10-07' }))
      .toEqual({
        floors: 'Escolha ao menos um andar',
        inspector: 'Escolha quem vai vistoriar',
        due: 'O prazo não pode ser antes da data agendada',
      });
    expect(validarAgendamento({ date: '2026-10-01', dueDate: '2026-10-09', floorIds: ['f'], inspectorId: 'i', hoje: '2026-10-07' }).date)
      .toBe('A data não pode estar no passado');
    expect(validarAgendamento({ date: '2026-10-01', dueDate: '2026-10-09', floorIds: ['f'], inspectorId: 'i', hoje: '2026-10-07', editando: true }))
      .toEqual({});
  });
});
