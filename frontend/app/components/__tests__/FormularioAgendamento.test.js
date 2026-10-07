import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { FormularioAgendamento, motivoDaSugestao, prazoPadrao, validarAgendamento } from '@/app/components/agenda/FormularioAgendamento';

/**
 * O formulário de agendar e de editar uma ronda, sozinho.
 *
 * O que se prende: a validação campo a campo, a sugestão marcada sem clique,
 * o grupo de inspetores andando pelas setas como um radio de verdade, e o
 * foco indo ao primeiro campo com erro quando o envio é barrado.
 */

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
let mockSugestao = [];

jest.mock('../../hooks/useApi', () => ({
  useFloors: () => ({
    data: { floors: [{ id: 'f2', label: '2º Andar' }, { id: 'f1', label: '3º Andar' }] },
    isLoading: false,
  }),
  useScheduleSuggestion: (_id, { floorIds }) =>
    floorIds.length
      ? { data: { inspectors: mockSugestao }, isFetching: false, isError: false }
      : { data: undefined, isFetching: false, isError: false },
  useCreateSchedule: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateSchedule: () => ({ mutate: mockUpdate, isPending: false }),
}));

const SUGESTAO = [
  { id: 'i2', name: 'Beatriz Lima', pending_count: 0, last_inspected_at: null, suggested: true },
  { id: 'i1', name: 'Carlos Andrade', pending_count: 2, last_inspected_at: '2026-09-01', suggested: false },
  { id: 'i3', name: 'Diego Souza', pending_count: 1, last_inspected_at: '2026-09-20', suggested: false },
];

const EDICAO = {
  id: 's1', building_id: 'p1', inspector: { id: 'i9', name: 'Rita Saída' }, inspector_left: true,
  scheduled_date: '2026-10-10', due_date: '2026-10-15', status: 'PENDENTE', overdue: false,
  floors: [{ id: 'f1', label: '3º Andar' }], notes: null,
};

function montar(props = {}) {
  return render(
    <FormularioAgendamento buildingId="p1" date="2099-10-10" onDateChange={jest.fn()} onDone={jest.fn()} {...props} />
  );
}

beforeEach(() => {
  mockSugestao = SUGESTAO;
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

describe('FormularioAgendamento', () => {
  it('sem andar não há lista de inspetores; com andar, o sugerido vem no topo e marcado', async () => {
    const user = userEvent.setup();
    montar();
    expect(screen.getByText(/Escolha os andares primeiro/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '3º Andar' }));
    const opcoes = screen.getAllByRole('radio');
    expect(opcoes[0]).toHaveTextContent('Beatriz Lima');
    expect(opcoes[0]).toHaveTextContent('Sugerido');
    expect(opcoes[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('o grupo de inspetores anda pelas setas, com um só na ordem do Tab', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: '3º Andar' }));

    const opcoes = () => screen.getAllByRole('radio');
    expect(opcoes().map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    opcoes()[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(opcoes()[1]).toHaveFocus();
    expect(opcoes()[1]).toHaveAttribute('aria-checked', 'true');
    expect(opcoes()[1]).toHaveAttribute('tabindex', '0');

    await user.keyboard('{ArrowRight}');
    expect(opcoes()[2]).toHaveFocus();
    // Dá a volta nas pontas.
    await user.keyboard('{ArrowDown}');
    expect(opcoes()[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(opcoes()[2]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(opcoes()[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('envio barrado leva o foco ao primeiro campo com erro, ligado à mensagem', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Agendar vistoria' }));

    expect(mockCreate).not.toHaveBeenCalled();
    const grupo = screen.getByRole('group', { name: 'Andares' });
    const erroId = grupo.getAttribute('aria-describedby');
    expect(document.getElementById(erroId)).toHaveTextContent('Escolha ao menos um andar');
    expect(within(grupo).getAllByRole('button')[0]).toHaveFocus();
  });

  it('sem inspetor escolhido, o erro vai no radiogroup', async () => {
    const user = userEvent.setup();
    mockSugestao = SUGESTAO.map((i) => ({ ...i, suggested: false }));
    montar();
    await user.click(screen.getByRole('button', { name: '3º Andar' }));
    await user.click(screen.getByRole('button', { name: 'Agendar vistoria' }));

    const grupo = screen.getByRole('radiogroup', { name: 'Inspetor' });
    expect(grupo).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(grupo.getAttribute('aria-describedby'))).toHaveTextContent('Escolha quem vai vistoriar');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
  });

  it('envia com o sugerido e o prazo padrão de uma semana', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: '3º Andar' }));
    await user.click(screen.getByRole('button', { name: 'Agendar vistoria' }));
    expect(mockCreate).toHaveBeenCalledWith(
      { buildingId: 'p1', inspector_id: 'i2', scheduled_date: '2099-10-10', due_date: prazoPadrao('2099-10-10'), floor_ids: ['f1'], notes: null },
      expect.any(Object)
    );
  });

  it('erro de data vindo de fora aparece no campo', () => {
    montar({ erroData: 'A data não pode estar no passado' });
    const data = screen.getByLabelText('Data da vistoria');
    expect(data).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('A data não pode estar no passado');
  });

  it('inspetor que saiu do prédio: o sugerido vem marcado e o antigo diz que não está mais lá', () => {
    montar({ schedule: EDICAO, date: '2026-10-10' });
    const opcoes = screen.getAllByRole('radio');
    expect(opcoes[0]).toHaveTextContent('Beatriz Lima');
    expect(opcoes[0]).toHaveAttribute('aria-checked', 'true');
    const saiu = opcoes.find((o) => o.textContent.includes('Rita Saída'));
    expect(saiu).toHaveTextContent('Não está mais neste prédio');
    expect(saiu).not.toHaveTextContent('0 pendentes');
  });

  it('"Selecionar todos" é link neutro, com altura de toque', () => {
    montar();
    const link = screen.getByRole('button', { name: 'Selecionar todos' });
    expect(link).toHaveClass('link-acao');
    expect(link).toHaveStyle({ minHeight: '32px' });
  });

  it('passa no axe, vazio e com a lista de inspetores', async () => {
    const user = userEvent.setup();
    const { container } = montar();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: '3º Andar' }));
    await user.click(screen.getByRole('button', { name: 'Agendar vistoria' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('regras puras do formulário', () => {
  it('validarAgendamento recusa data passada só em agendamento novo', () => {
    const base = { date: '2026-10-01', dueDate: '2026-10-09', floorIds: ['f'], inspectorId: 'i', hoje: '2026-10-07' };
    expect(validarAgendamento(base).date).toBe('A data não pode estar no passado');
    expect(validarAgendamento({ ...base, editando: true })).toEqual({});
  });

  it('motivoDaSugestao diz o critério que decidiu', () => {
    const a = { id: 'a', pending_count: 0, suggested: true };
    expect(motivoDaSugestao(a, [a, { id: 'b', pending_count: 2 }])).toBe('Nenhuma vistoria pendente no período');
  });
});
