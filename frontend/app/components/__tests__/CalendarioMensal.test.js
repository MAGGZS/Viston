import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { CalendarioMensal } from '@/app/components/agenda/CalendarioMensal';
import { groupSchedulesByDay } from '@/app/lib/agenda';

/**
 * O calendário da agenda.
 *
 * O mês fica fixo em outubro de 2026 e "hoje" é congelado em 7/10: o que se
 * testa é a grade e as marcas, e não o dia em que a suíte roda.
 */
// Só o `Date` é congelado: com os temporizadores falsos, o user-event e o axe
// ficariam esperando um relógio que não anda.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 7, 10, 0, 0),
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
      'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });
});
afterAll(() => jest.useRealTimers());

const SCHEDULES = [
  { id: 'a', scheduled_date: '2026-10-10', status: 'PENDENTE', overdue: false },
  { id: 'b', scheduled_date: '2026-10-10', status: 'PENDENTE', overdue: true },
  { id: 'c', scheduled_date: '2026-10-15', status: 'CONCLUIDO', overdue: false },
  { id: 'd', scheduled_date: '2026-10-20', status: 'PENDENTE', overdue: false },
  { id: 'e', scheduled_date: '2026-10-20', status: 'PENDENTE', overdue: false },
  { id: 'f', scheduled_date: '2026-10-20', status: 'PENDENTE', overdue: false },
  { id: 'g', scheduled_date: '2026-10-20', status: 'PENDENTE', overdue: false },
];

function Controlado({ onSelectDate, ...props }) {
  const [m, setM] = useState({ month: 10, year: 2026 });
  const [sel, setSel] = useState(null);
  return (
    <CalendarioMensal
      month={m.month}
      year={m.year}
      onMonthChange={(month, year) => setM({ month, year })}
      selectedDate={sel}
      onSelectDate={(k) => {
        setSel(k);
        onSelectDate?.(k);
      }}
      marks={groupSchedulesByDay(SCHEDULES)}
      {...props}
    />
  );
}

/** O botão do dia `d` — ancorado na vírgula para "7" não casar com "17" e "27". */
const dia = (d, resto = '', mes = 'outubro') =>
  screen.getByRole('button', { name: new RegExp(`, ${d} de ${mes} de 2026${resto}`) });

describe('CalendarioMensal', () => {
  it('mostra o mês, a grade de 6 semanas e domingo primeiro', () => {
    render(<Controlado />);
    expect(screen.getByText('Outubro 2026')).toBeInTheDocument();
    const grid = screen.getByRole('grid');
    // 1 linha de cabeçalho + 6 semanas
    expect(within(grid).getAllByRole('row')).toHaveLength(7);
    expect(within(grid).getAllByRole('columnheader')[0]).toHaveAccessibleName('domingo');
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(42);
  });

  it('anuncia data por extenso, hoje e quantidade de agendamentos', () => {
    render(<Controlado />);
    expect(dia(7, ', hoje')).toHaveAttribute('aria-current', 'date');
    expect(dia(10, ', 2 agendamentos, 1 atrasada')).toBeInTheDocument();
    expect(dia(11, ', sem agendamentos')).toBeInTheDocument();
  });

  it('desenha uma bolinha por agendamento, no máximo três', () => {
    render(<Controlado />);
    const contar = (d) => dia(d).querySelectorAll('span[aria-hidden="true"] > span').length;
    expect(contar(10)).toBe(2);
    expect(contar(15)).toBe(1);
    expect(contar(20)).toBe(3);
    expect(contar(11)).toBe(0);
  });

  it('seleciona o dia no clique e marca a célula', async () => {
    const user = userEvent.setup();
    const onSelectDate = jest.fn();
    render(<Controlado onSelectDate={onSelectDate} />);
    await user.click(dia(15));
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-15');
    expect(dia(15).closest('[role="gridcell"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('troca de mês pelas setas do cabeçalho', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByText('Novembro 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByText('Setembro 2026')).toBeInTheDocument();
  });

  it('anda pelos dias com as setas do teclado, cruzando o mês', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    // Só um dia no Tab: hoje.
    expect(dia(7)).toHaveAttribute('tabindex', '0');
    dia(7).focus();
    await user.keyboard('{ArrowRight}');
    expect(dia(8)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(dia(15)).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(screen.getByText('Novembro 2026')).toBeInTheDocument();
    expect(dia(15, '', 'novembro')).toHaveFocus();
  });

  it('não deixa escolher dia passado com disabledPast', async () => {
    const user = userEvent.setup();
    const onSelectDate = jest.fn();
    render(<Controlado disabledPast onSelectDate={onSelectDate} />);
    const ontem = dia(6);
    expect(ontem).toHaveAttribute('aria-disabled', 'true');
    await user.click(ontem);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('no tamanho grande, usa renderDayContent', () => {
    render(
      <Controlado
        size="large"
        renderDayContent={(key, marks) => (marks.length ? <span>{`${marks.length} chips em ${key}`}</span> : null)}
      />
    );
    expect(screen.getByText('2 chips em 2026-10-10')).toBeInTheDocument();
  });

  it('passa no axe', async () => {
    const { container } = render(<Controlado />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CalendarioMensal: resumo do dia no hover', () => {
  const original = window.matchMedia;
  const comPonteiro = (fino) => {
    window.matchMedia = (query) => ({
      matches: fino && query.includes('pointer: fine'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  };
  afterEach(() => {
    window.matchMedia = original;
  });

  const COM_ANDARES = [
    {
      id: 'x1', scheduled_date: '2026-10-10', due_date: '2026-10-15', status: 'PENDENTE', overdue: false,
      inspector: { id: 'i1', name: 'Carlos Andrade' }, floors: [{ label: '3' }], inspector_left: true,
    },
    ...['x2', 'x3', 'x4', 'x5', 'x6'].map((id) => ({
      id, scheduled_date: '2026-10-20', due_date: '2026-10-25', status: 'PENDENTE', overdue: false,
      inspector: { id: 'i2', name: 'Beatriz Lima' }, floors: [{ label: 'Térreo' }],
    })),
  ];
  const resumo = () => document.body.querySelector('[data-resumo-do-dia]');
  const renderizar = () =>
    render(<CalendarioMensal month={10} year={2026} marks={groupSchedulesByDay(COM_ANDARES)} size="compact" />);
  const dia = (container, key) => container.querySelector(`[data-date="${key}"]`);

  it('com ponteiro fino, o dia com agendamento mostra o resumo, sem entrar na árvore acessível', async () => {
    comPonteiro(true);
    const { container } = renderizar();
    const user = userEvent.setup();
    await user.hover(dia(container, '2026-10-10'));

    await waitFor(() => expect(resumo()).not.toBeNull());
    expect(resumo()).toHaveAttribute('aria-hidden', 'true');
    expect(resumo().style.pointerEvents).toBe('none');
    expect(resumo()).toHaveTextContent('Carlos Andrade');
    expect(resumo()).toHaveTextContent('3º andar');
    expect(resumo()).toHaveTextContent('Pendente');
    expect(resumo()).toHaveTextContent('até 15/10');
    // Status e prazo têm linha própria, fora da linha dos andares (que pode crescer).
    expect(resumo().querySelector('[data-status]')).toHaveTextContent('Pendente');
    expect(within(resumo()).getByText('até 15/10').style.textOverflow).toBe('');
    expect(resumo()).toHaveTextContent('Inspetor saiu');
  });

  it('dia sem agendamento não mostra', async () => {
    comPonteiro(true);
    const { container } = renderizar();
    const user = userEvent.setup();
    await user.hover(dia(container, '2026-10-11'));
    await new Promise((r) => setTimeout(r, 150));
    expect(resumo()).toBeNull();
  });

  it('com ponteiro grosso (toque) não mostra', async () => {
    comPonteiro(false);
    const { container } = renderizar();
    const user = userEvent.setup();
    await user.hover(dia(container, '2026-10-10'));
    await new Promise((r) => setTimeout(r, 150));
    expect(resumo()).toBeNull();
  });

  it('cancelado: nome e prazo riscados, "Cancelado" sem risco', async () => {
    comPonteiro(true);
    const cancelado = {
      id: 'k1', scheduled_date: '2026-10-12', due_date: '2026-10-16', status: 'CANCELADO', overdue: false,
      inspector: { id: 'i1', name: 'Carlos Andrade' }, floors: [{ label: '4' }],
    };
    const { container } = render(
      <CalendarioMensal month={10} year={2026} marks={groupSchedulesByDay([cancelado])} size="compact" />
    );
    await userEvent.setup().hover(dia(container, '2026-10-12'));
    await waitFor(() => expect(resumo()).not.toBeNull());
    expect(within(resumo()).getByText('Carlos Andrade').style.textDecoration).toBe('line-through');
    expect(within(resumo()).getByText('até 16/10').style.textDecoration).toBe('line-through');
    const status = within(resumo()).getByText('Cancelada');
    expect(status.style.textDecoration).toBe('');
  });

  it('acima de 4 agendamentos, mostra 4 e "+N"', async () => {
    comPonteiro(true);
    const { container } = renderizar();
    const user = userEvent.setup();
    await user.hover(dia(container, '2026-10-20'));
    await waitFor(() => expect(resumo()).not.toBeNull());
    expect(within(resumo()).getAllByRole('listitem', { hidden: true })).toHaveLength(4);
    expect(resumo()).toHaveTextContent('+1');
  });
});
