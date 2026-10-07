import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';

/** A caixa de detalhes: um dia (ou um agendamento), quem vai, quando, e o lápis. */
const S = (id, extra = {}) => ({
  id,
  building_id: 'p1',
  building_name: 'Edifício Aurora',
  inspector: { id: 'i1', name: 'Carlos Andrade' },
  scheduled_date: '2026-10-10',
  due_date: '2026-10-15',
  status: 'PENDENTE',
  overdue: false,
  floors: [{ id: 'f1', label: '3º Andar' }],
  notes: null,
  ...extra,
});

describe('ScheduleDetailsModal', () => {
  it('fechada não mostra nada', () => {
    render(<ScheduleDetailsModal open={false} onClose={() => {}} schedules={[S('a')]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dia sem agendamento diz que não há nada', () => {
    render(<ScheduleDetailsModal open onClose={() => {}} schedules={[]} dateKey="2026-10-10" />);
    const caixa = screen.getByRole('dialog', { name: 'Agenda de 10 de outubro' });
    expect(within(caixa).getByText(/Nenhuma vistoria agendada/)).toBeInTheDocument();
  });

  it('mostra prédio, inspetor, andares, observação e quem agendou', () => {
    render(
      <ScheduleDetailsModal
        open
        onClose={() => {}}
        schedules={[S('a', { notes: 'Levar a chave', created_by: { name: 'Gestor Silva' } })]}
      />
    );
    const caixa = screen.getByRole('dialog', { name: 'Vistoria agendada' });
    expect(within(caixa).getByText('Edifício Aurora')).toBeInTheDocument();
    expect(within(caixa).getByText('Carlos Andrade')).toBeInTheDocument();
    expect(within(caixa).getByText('3º Andar')).toBeInTheDocument();
    expect(within(caixa).getByText('Levar a chave')).toBeInTheDocument();
    expect(within(caixa).getByText(/Agendada por Gestor Silva/)).toBeInTheDocument();
  });

  it('estados: atrasado com triângulo e neutro, prazo vencido em vermelho, inspetor que saiu com selo', () => {
    render(
      <ScheduleDetailsModal
        open
        onClose={() => {}}
        schedules={[
          S('a', { overdue: true }),
          S('b', { overdue: true, past_deadline: true }),
          S('c', { inspector_left: true }),
        ]}
      />
    );
    const caixa = screen.getByRole('dialog');
    expect(within(caixa).getByText('Atrasado')).toBeInTheDocument();
    expect(within(caixa).getByText(/dia agendado já passou/)).toBeInTheDocument();
    expect(within(caixa).getByText('Prazo vencido')).toBeInTheDocument();
    expect(within(caixa).getByText(/prazo vencido$/)).toBeInTheDocument();
    expect(within(caixa).getByText('Inspetor saiu')).toBeInTheDocument();
    expect(caixa.querySelector('.lucide-triangle-alert, .lucide-alert-triangle')).toBeInTheDocument();
  });

  it('o lápis aparece só nos editáveis, com o nome e a data no rótulo', async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    render(
      <ScheduleDetailsModal
        open
        onClose={() => {}}
        schedules={[S('a'), S('b', { status: 'CONCLUIDO', inspector: { id: 'i2', name: 'Beatriz Lima' } })]}
        onEdit={onEdit}
      />
    );
    const lapis = screen.getAllByRole('button', { name: /^Editar agendamento de/ });
    expect(lapis).toHaveLength(1);
    expect(lapis[0]).toHaveAccessibleName('Editar agendamento de Carlos Andrade, 10/10');
    await user.click(lapis[0]);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('showInspector como função mostra o nome só de quem ela escolhe', () => {
    render(
      <ScheduleDetailsModal
        open
        onClose={() => {}}
        schedules={[S('meu', { inspector: { id: 'u1', name: 'Eu Mesma' } }), S('colega')]}
        showInspector={(s) => s.inspector.id !== 'u1'}
      />
    );
    expect(screen.getByText('Carlos Andrade')).toBeInTheDocument();
    expect(screen.queryByText('Eu Mesma')).not.toBeInTheDocument();
  });

  it('passa no axe', async () => {
    render(<ScheduleDetailsModal open onClose={() => {}} schedules={[S('a', { overdue: true })]} onEdit={() => {}} />);
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
