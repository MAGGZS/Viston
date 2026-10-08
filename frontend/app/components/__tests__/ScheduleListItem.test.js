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

  it('cancelado: inspetor, andares e datas riscados; a etiqueta fica legível, sem risco e sem lápis', () => {
    render(<ScheduleListItem schedule={{ ...BASE, status: 'CANCELADO' }} onEdit={undefined} />);
    expect(screen.getByText('Carlos Andrade').style.textDecoration).toBe('line-through');
    expect(screen.getByText('3º Andar, 4º Andar +1').style.textDecoration).toBe('line-through');
    expect(screen.getByText('até 12/10').closest('span[style*="line-through"]')).not.toBeNull();
    const etiqueta = screen.getByText('Cancelada');
    expect(etiqueta.closest('[style*="line-through"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('diz "Atrasado" quando o prazo venceu', () => {
    render(<ScheduleListItem schedule={{ ...BASE, overdue: true }} />);
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
  });

  it('passou do "até quando": "Prazo vencido"; concluído depois do dia: "Concluído com atraso"', () => {
    const { rerender } = render(<ScheduleListItem schedule={{ ...BASE, overdue: true, past_deadline: true }} />);
    expect(screen.getByText('Prazo vencido')).toBeInTheDocument();
    rerender(<ScheduleListItem schedule={{ ...BASE, status: 'CONCLUIDO', completed_late: true }} />);
    expect(screen.getByText('Concluída com atraso')).toBeInTheDocument();
  });

  it('inspetor com conta apagada aparece pelo nome que a API manda', () => {
    render(<ScheduleListItem schedule={{ ...BASE, inspector: { id: null, name: 'Usuário removido' } }} />);
    expect(screen.getByText('Usuário removido')).toBeInTheDocument();
  });

  it('mostra o prédio quando pedido', () => {
    render(<ScheduleListItem schedule={BASE} showBuilding />);
    expect(screen.getByText(/Edifício Aurora/)).toBeInTheDocument();
  });

  it('sem onEdit não há lápis; com onEdit, o lápis entrega o agendamento', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleListItem schedule={BASE} />);
    expect(screen.queryByRole('button', { name: /^Editar agendamento/ })).not.toBeInTheDocument();

    const onEdit = jest.fn();
    const onClick = jest.fn();
    rerender(<ScheduleListItem schedule={BASE} onEdit={onEdit} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /^Editar agendamento/ }));
    expect(onEdit).toHaveBeenCalledWith(BASE);
    // O lápis não dispara o clique da linha.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('o lápis diz de quem e de quando é o agendamento', () => {
    render(<ScheduleListItem schedule={BASE} onEdit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Editar agendamento de Carlos Andrade, 07/10' })).toBeInTheDocument();
  });

  it('atrasado leva o triângulo de alerta na etiqueta; inspetor que saiu ganha o selo', () => {
    const { container, rerender } = render(<ScheduleListItem schedule={{ ...BASE, overdue: true }} />);
    expect(container.querySelector('.lucide-triangle-alert, .lucide-alert-triangle')).toBeInTheDocument();
    rerender(<ScheduleListItem schedule={{ ...BASE, inspector_left: true }} />);
    expect(screen.getByText('Inspetor saiu')).toBeInTheDocument();
    rerender(<ScheduleListItem schedule={{ ...BASE, inspector_left: true, status: 'CANCELADO' }} />);
    expect(screen.queryByText('Inspetor saiu')).not.toBeInTheDocument();
  });

  it('passa no axe', async () => {
    const { container } = render(
      <ScheduleListItem schedule={BASE} onClick={() => {}} onEdit={() => {}} showBuilding />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
