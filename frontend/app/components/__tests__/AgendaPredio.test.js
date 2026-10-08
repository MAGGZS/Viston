import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useToastStore } from '@/app/store/toast';
import { useUnsavedStore } from '@/app/store/unsaved';
import { AgendaPredio } from '@/app/components/agenda/AgendaPredio';
import { motivoDaSugestao, validarAgendamento } from '@/app/components/agenda/FormularioAgendamento';
import { resumoAndares, rotuloAndar } from '@/app/lib/agenda';

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

// O que a consulta do mês devolve. `mockFalhaDoMes` faz a consulta falhar.
let mockDoMes = mockSchedules;
let mockFalhaDoMes = false;

jest.mock('../../hooks/useApi', () => ({
  useBuildingSchedules: () =>
    mockFalhaDoMes
      ? { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: jest.fn() }
      : { data: { schedules: mockDoMes }, isLoading: false, isError: false, isFetching: false, refetch: jest.fn() },
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
  mockDoMes = mockSchedules;
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

    await user.click(within(painel()).getByRole('button', { name: /Atrasadas/ }));
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

  it('prédio inativo deixa "Agendar" desligado e avisa', () => {
    render(<AgendaPredio buildingId="p1" canEdit frozen />);
    expect(screen.getByRole('button', { name: /Agendar/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Prédio inativo');
  });

  it('o dia com agendamento atrasado ganha a borda vermelha; o só com pendente futuro, não', () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    const atrasado = dia(container, '2026-10-02');
    expect(atrasado).toHaveAttribute('data-atrasado', 'true');
    expect(atrasado.style.boxShadow).toContain('var(--color-danger)');
    expect(atrasado).toHaveAccessibleName(/1 atrasada/);

    const futuro = dia(container, '2026-10-10');
    expect(futuro).not.toHaveAttribute('data-atrasado');
    expect(futuro.style.boxShadow).not.toContain('var(--color-danger)');
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

  it('a linha de quem ficou sem inspetor leva o selo; o lápis abre a edição com o sugerido', async () => {
    mockDoMes = [{ ...mockSchedules[0], inspector_left: true }, ...mockSchedules.slice(1)];
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);

    const linha = container.querySelector('[data-schedule-id="s1"]');
    expect(within(linha).getByText('Inspetor saiu')).toBeInTheDocument();

    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de Carlos Andrade/ }));
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

describe('AgendaPredio: painel recolhível e flutuante', () => {
  // O recolher anima a coluna; o painel só sai da árvore de acessibilidade
  // (visibility: hidden) quando a animação termina.
  const terminarAnimacao = () => act(() => jest.advanceTimersByTime(400));
  const esconder = async () => {
    const botao = within(painel()).getByRole('button', { name: 'Esconder painel' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    await user.click(botao);
    terminarAnimacao();
  };

  it('esconde e mostra o painel, com aria-expanded e o foco no botão que fica', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();

    expect(screen.queryByRole('complementary', { name: 'Agendamentos' })).not.toBeInTheDocument();
    const mostrar = screen.getByRole('button', { name: 'Mostrar painel' });
    expect(mostrar).toHaveAttribute('aria-expanded', 'false');
    expect(mostrar).toHaveFocus();

    await user.click(mostrar);
    terminarAnimacao();
    expect(painel()).toBeInTheDocument();
    expect(within(painel()).getByRole('button', { name: 'Esconder painel' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Mostrar painel' })).not.toBeInTheDocument();
  });

  it('com o painel escondido, o dia abre o painel flutuante e não a coluna', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();
    await user.click(dia(container, '2026-10-10'));

    const flutuante = screen.getByRole('dialog', { name: 'Nova vistoria' });
    expect(flutuante).not.toHaveAttribute('aria-modal', 'true');
    expect(within(flutuante).getByRole('heading', { name: 'Nova vistoria' })).toHaveFocus();
    expect(within(flutuante).getByLabelText('Data da vistoria')).toHaveValue('2026-10-10');
    expect(screen.queryByRole('complementary', { name: 'Agendamentos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar painel' })).toHaveAttribute('aria-expanded', 'false');
    expect(dia(container, '2026-10-10')).toHaveClass('is-selecionado');

    // Com ele aberto, outro dia só troca a data.
    await user.click(dia(container, '2026-10-12'));
    expect(within(screen.getByRole('dialog')).getByLabelText('Data da vistoria')).toHaveValue('2026-10-12');
  });

  it('Esc fecha o flutuante e devolve o foco ao dia de origem', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();
    await user.click(dia(container, '2026-10-10'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    terminarAnimacao();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dia(container, '2026-10-10')).toHaveFocus();
    expect(dia(container, '2026-10-10')).not.toHaveClass('is-selecionado');
  });

  it('o X fecha e devolve o foco a "Agendar"', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();
    const agendar = screen.getByRole('button', { name: /Agendar/ });
    await user.click(agendar);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar painel' }));
    terminarAnimacao();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(agendar).toHaveFocus();
  });

  it('fixar volta ao layout de duas colunas, sem perder o formulário', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '3º Andar' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fixar painel ao lado do calendário' }));
    terminarAnimacao();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
    expect(within(painel()).getByRole('button', { name: '3º Andar' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(painel()).getByRole('button', { name: 'Esconder painel' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Mostrar painel' })).not.toBeInTheDocument();
  });

  it('com o flutuante aberto, "Mostrar painel" segue à mão e fixa o painel', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await esconder();
    await user.click(dia(container, '2026-10-10'));
    await user.click(screen.getByRole('button', { name: 'Mostrar painel' }));
    terminarAnimacao();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
  });

  it('o calendário grande não mostra a semana inteira do mês seguinte', () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    // Outubro/2026 cabe em 5 semanas: 27/09 a 31/10.
    expect(screen.getByRole('grid', { name: /Outubro 2026/ }).querySelectorAll('[role="row"]')).toHaveLength(6);
    expect(dia(container, '2026-09-27')).toBeInTheDocument();
    expect(dia(container, '2026-11-01')).not.toBeInTheDocument();
  });

  it('passa no axe com o flutuante aberto', async () => {
    jest.useRealTimers();
    const u = userEvent.setup();
    try {
      render(<AgendaPredio buildingId="p1" canEdit />);
      await u.click(within(painel()).getByRole('button', { name: 'Esconder painel' }));
      await u.click(screen.getByRole('button', { name: /Agendar/ }));
      await act(() => new Promise((r) => setTimeout(r, 400)));
      expect(await axe(document.body)).toHaveNoViolations();
    } finally {
      jest.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0, 0) });
    }
  }, 20000);
});

describe('AgendaPredio: descartar alterações', () => {
  // A confirmação sai com animação; o foco só volta depois que ela some.
  const terminarAnimacao = () => act(() => jest.advanceTimersByTime(400));
  const abrirNovoSujo = async (container) => {
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(painel()).getByRole('button', { name: '3º Andar' }));
  };

  it('formulário mexido: Voltar pergunta; "Continuar editando" fica, "Descartar" sai', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await abrirNovoSujo(container);

    const voltar = within(painel()).getByRole('button', { name: 'Voltar para a lista' });
    await user.click(voltar);
    let caixa = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    // A saída segura vem primeiro, e é ela que o `<dialog>` foca ao abrir.
    expect(within(caixa).getAllByRole('button')[0]).toHaveAccessibleName('Continuar editando');
    expect(within(caixa).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();

    await user.click(within(caixa).getByRole('button', { name: 'Continuar editando' }));
    terminarAnimacao();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
    expect(within(painel()).getByRole('button', { name: '3º Andar' })).toHaveAttribute('aria-pressed', 'true');
    expect(voltar).toHaveFocus();

    await user.click(voltar);
    caixa = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    await user.click(within(caixa).getByRole('button', { name: 'Descartar' }));
    terminarAnimacao();
    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
  });

  it('sem alteração, Voltar sai direto, sem perguntar', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
  });

  it('a edição desfeita volta a não perguntar', async () => {
    render(<AgendaPredio buildingId="p1" canEdit />);
    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));
    const andar = within(painel()).getByRole('button', { name: '3º Andar' });
    await user.click(andar);
    await user.click(andar);
    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('depois de salvar, sai sem perguntar', async () => {
    mockCreate.mockImplementation((_vars, { onSuccess }) => onSuccess());
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await abrirNovoSujo(container);
    await user.click(within(painel()).getByRole('button', { name: 'Agendar vistoria' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Agendamentos do mês' })).toBeInTheDocument();
  });

  it('com o formulário mexido, o lápis de outro agendamento pergunta antes de trocar', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await abrirNovoSujo(container);
    // O formulário novo do dia 10 lista o s1, que já está nele.
    const existente = container.querySelector('[data-schedule-id="s1"]');
    await user.click(within(existente).getByRole('button', { name: /^Editar agendamento de/ }));
    expect(screen.getByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument();
    expect(within(painel()).getByRole('heading', { name: 'Nova vistoria' })).toBeInTheDocument();
  });

  it('Esc no painel flutuante com o formulário mexido pede confirmação', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(within(painel()).getByRole('button', { name: 'Esconder painel' }));
    terminarAnimacao();
    await user.click(dia(container, '2026-10-10'));
    const flutuante = screen.getByRole('dialog', { name: 'Nova vistoria' });
    await user.click(within(flutuante).getByRole('button', { name: '3º Andar' }));

    await user.keyboard('{Escape}');
    const caixa = screen.getByRole('dialog', { name: 'Descartar alterações?' });
    expect(screen.getByRole('dialog', { name: 'Nova vistoria' })).toBeInTheDocument();

    await user.click(within(caixa).getByRole('button', { name: 'Descartar' }));
    terminarAnimacao();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/**
 * O formulário mexido também segura o menu lateral, os links e o F5 — pelo
 * registro global de `useUnsavedFlag`. Sair por dentro (descartar, salvar,
 * 409) tem de tirá-lo do registro, ou a próxima navegação perguntaria de novo.
 */
describe('AgendaPredio: aviso global de alterações não salvas', () => {
  const sujoGlobal = () => useUnsavedStore.getState().dirty.length > 0;
  const terminarAnimacao = () => act(() => jest.advanceTimersByTime(400));

  beforeEach(() => useUnsavedStore.setState({ dirty: [], pending: null }));

  it('formulário mexido liga a flag; desfeito, ela cai', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    expect(sujoGlobal()).toBe(false);

    const andar = within(painel()).getByRole('button', { name: '3º Andar' });
    await user.click(andar);
    expect(sujoGlobal()).toBe(true);

    await user.click(andar);
    expect(sujoGlobal()).toBe(false);
  });

  it('"Descartar" da confirmação interna desliga a flag', async () => {
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(painel()).getByRole('button', { name: '3º Andar' }));

    await user.click(within(painel()).getByRole('button', { name: 'Voltar para a lista' }));
    // A pergunta é a de dentro, e só ela; a flag segue ligada até a resposta.
    expect(screen.getAllByRole('dialog', { name: 'Descartar alterações?' })).toHaveLength(1);
    expect(sujoGlobal()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    terminarAnimacao();
    expect(sujoGlobal()).toBe(false);
    expect(useUnsavedStore.getState().pending).toBeNull();
  });

  it('salvar desliga a flag', async () => {
    mockCreate.mockImplementation((_vars, { onSuccess }) => onSuccess());
    const { container } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(painel()).getByRole('button', { name: '3º Andar' }));
    expect(sujoGlobal()).toBe(true);

    await user.click(within(painel()).getByRole('button', { name: 'Agendar vistoria' }));
    expect(sujoGlobal()).toBe(false);
  });

  it('409 ao salvar volta para a lista com a flag desligada', async () => {
    mockUpdate.mockImplementation((_vars, { onError }) =>
      onError({ response: { status: 409, data: { error: { message: 'O agendamento mudou.' } } } })
    );
    render(<AgendaPredio buildingId="p1" canEdit />);
    const linha = within(painel()).getByText('2º Andar').closest('li');
    await user.click(within(linha).getByRole('button', { name: /^Editar agendamento de/ }));
    await user.type(within(painel()).getByLabelText('Observação (opcional)'), 'x');
    expect(sujoGlobal()).toBe(true);

    await user.click(within(painel()).getByRole('button', { name: 'Salvar alterações' }));
    expect(sujoGlobal()).toBe(false);
  });

  it('a agenda saindo da tela não deixa a flag para trás', async () => {
    const { container, unmount } = render(<AgendaPredio buildingId="p1" canEdit />);
    await user.click(dia(container, '2026-10-10'));
    await user.click(within(painel()).getByRole('button', { name: '3º Andar' }));
    expect(sujoGlobal()).toBe(true);

    unmount();
    expect(sujoGlobal()).toBe(false);
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

  it('andar cadastrado só com número ganha contexto; os outros ficam como estão', () => {
    expect(rotuloAndar('4')).toBe('4º andar');
    expect(rotuloAndar('3º Andar')).toBe('3º Andar');
    expect(rotuloAndar('Térreo')).toBe('Térreo');
    expect(resumoAndares([{ label: '4' }, { label: '2' }, { label: '3' }], 2)).toBe('4º andar, 2º andar +1');
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
