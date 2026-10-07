import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ScheduleListItem } from '@/app/components/agenda/ScheduleListItem';

/**
 * A linha da agenda: quem, onde, quando, em que pé está — e o lápis só para
 * quem pode editar.
 */
const BASE = {
  id: 's1',
  building_id: 'p1',
  building_name: 'Edifício Aurora',
  inspector: { id: 'i1', name: 'Carlos Andrade' },
  scheduled_date: '2026-10-07',
  due_date: '2026-10-12',
  status: 'PENDENTE',
  overdue: false,
  floors: [
    { id: 'f3', label: '3º Andar' },
    { id: 'f4', label: '4º Andar' },
    { id: 'f5', label: '5º Andar' },
  ],
};

describe('ScheduleListItem', () => {
  it('mostra inspetor, andares resumidos, data → prazo e status', () => {
    render(<ScheduleListItem schedule={BASE} />);
    expect(screen.getByText('Carlos Andrade')).toBeInTheDocument();
    expect(screen.getByText('3º Andar, 4º Andar +1')).toBeInTheDocument();
    expect(screen.getByText(/07\/10/)).toBeInTheDocument();
    expect(screen.getByText('até 12/10')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('diz "Atrasado" quando o prazo venceu', () => {
    render(<ScheduleListItem schedule={{ ...BASE, overdue: true }} />);
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
  });

  it('mostra o prédio quando pedido', () => {
    render(<ScheduleListItem schedule={BASE} showBuilding />);
    expect(screen.getByText(/Edifício Aurora/)).toBeInTheDocument();
  });

  it('sem onEdit não há lápis; com onEdit, o lápis entrega o agendamento', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleListItem schedule={BASE} />);
    expect(screen.queryByRole('button', { name: 'Editar agendamento' })).not.toBeInTheDocument();

    const onEdit = jest.fn();
    const onClick = jest.fn();
    rerender(<ScheduleListItem schedule={BASE} onEdit={onEdit} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Editar agendamento' }));
    expect(onEdit).toHaveBeenCalledWith(BASE);
    // O lápis não dispara o clique da linha.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passa no axe', async () => {
    const { container } = render(
      <ScheduleListItem schedule={BASE} onClick={() => {}} onEdit={() => {}} showBuilding />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
