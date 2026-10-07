import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const mockSuggestion = [
  { id: 'i2', name: 'Beatriz Lima', pending_count: 0, last_inspected_at: null, suggested: true },
  { id: 'i1', name: 'Carlos Andrade', pending_count: 2, last_inspected_at: '2026-09-01', suggested: false },
];

jest.mock('../../hooks/useApi', () => ({
  useBuildingSchedules: () => ({
    data: { schedules: mockSchedules }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn(),
  }),
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
    await user.click(within(linha).getByRole('button', { name: 'Editar agendamento' }));

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
    expect(screen.queryByRole('button', { name: 'Editar agendamento' })).not.toBeInTheDocument();
  });

  it('prédio inativo deixa "Agendar" desligado e avisa', () => {
    render(<AgendaPredio buildingId="p1" canEdit frozen />);
    expect(screen.getByRole('button', { name: /Agendar/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Prédio inativo');
  });
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
