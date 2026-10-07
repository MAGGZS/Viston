import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CalendarioDoPainel,
  CoberturaDeAndares,
  DesempenhoInspetores,
  GraficoAgendamentos,
  LinkParaAgenda,
  NumerosDaAgenda,
  contagensDaAgenda,
} from '@/app/desktop/visualizacao/_componentes/PainelSupervisor';

/**
 * As peças do painel do visualizador, com a API de mentira: carregando,
 * vazio, com dados, e com erro.
 */
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

let mockAgenda = { data: { schedules: [] }, isError: false };
jest.mock('../../hooks/useApi', () => ({
  useBuildingSchedules: () => mockAgenda,
}));

const hoje = new Date();
const chave = (d) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

beforeEach(() => {
  mockPush.mockReset();
  mockAgenda = { data: { schedules: [] }, isError: false };
});

describe('PainelSupervisor', () => {
  it('contagensDaAgenda não conta o prazo vencido duas vezes', () => {
    expect(contagensDaAgenda({ overdue: 5, past_deadline: 2, pending: 3 })).toMatchObject({
      atrasados: 5, vencidos: 2, atrasadosNoPrazo: 3, pendentes: 3,
    });
    expect(contagensDaAgenda(undefined).atrasados).toBe(0);
  });

  it('números da agenda: os quatro, e "Sem inspetor" quando há', () => {
    const { rerender } = render(<NumerosDaAgenda schedules={{ pending: 4, overdue: 2, past_deadline: 1, done_on_time: 7, done_late: 1 }} />);
    expect(screen.getByText('1 com prazo vencido')).toBeInTheDocument();
    expect(screen.queryByText(/Sem inspetor/)).not.toBeInTheDocument();

    rerender(<NumerosDaAgenda schedules={{ pending: 4 }} semInspetor={2} />);
    expect(screen.getByText('Sem inspetor: 2')).toBeInTheDocument();
  });

  it('desempenho: esqueleto, vazio, e tabela do mais ativo para o menos', () => {
    const { rerender, container } = render(<DesempenhoInspetores loading />);
    expect(container.querySelector('table')).toBeNull();

    rerender(<DesempenhoInspetores inspectors={[]} />);
    expect(screen.getByText('Nenhuma vistoria no período.')).toBeInTheDocument();

    rerender(
      <DesempenhoInspetores
        inspectors={[
          { id: 'a', name: 'Ana', inspections: 2, days: 1, floors: 4, occurrences: 0 },
          { id: 'b', name: 'Bruno', inspections: 9, days: 5, floors: 20, occurrences: 3 },
        ]}
      />
    );
    const linhas = screen.getAllByRole('row').slice(1);
    expect(linhas[0]).toHaveTextContent('Bruno');
    expect(linhas[1]).toHaveTextContent('Ana');
  });

  it('gráfico de agendamentos: vazio quando não há nada no período', () => {
    render(<GraficoAgendamentos schedules={{}} />);
    expect(screen.getByText(/Nenhum agendamento com prazo/)).toBeInTheDocument();
  });

  it('cobertura: nunca vistoriado primeiro, e "Ver todos" é link neutro que abre o resto', async () => {
    const user = userEvent.setup();
    const coverage = Array.from({ length: 10 }, (_, i) => ({
      floor_id: `f${i}`, label: `${i}º Andar`, days_since: i === 3 ? null : i, last_inspected_at: null,
    }));
    render(<CoberturaDeAndares coverage={coverage} />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(8);
    expect(itens[0]).toHaveTextContent('Nunca vistoriado');

    const ver = screen.getByRole('button', { name: 'Ver todos os 10 andares' });
    expect(ver).toHaveClass('link-acao');
    expect(ver).toHaveStyle({ minHeight: '32px' });
    await user.click(ver);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(ver).toHaveAttribute('aria-expanded', 'true');
  });

  it('o link para a agenda é neutro, com o anel de foco do link-acao', () => {
    render(<LinkParaAgenda />);
    const link = screen.getByRole('link', { name: /Abrir agenda/ });
    expect(link).toHaveAttribute('href', '/desktop/visualizacao/agenda');
    expect(link).toHaveClass('link-acao');
  });

  it('calendário do painel: erro avisa; dia marcado abre a caixa, e o lápis leva à agenda', async () => {
    mockAgenda = { data: undefined, isError: true };
    const { unmount } = render(<CalendarioDoPainel buildingId="p1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a agenda deste mês.');
    unmount();

    const user = userEvent.setup();
    mockAgenda = {
      isError: false,
      data: {
        schedules: [{
          id: 's1', inspector: { id: 'i1', name: 'Carlos Andrade' }, scheduled_date: chave(12), due_date: chave(14),
          status: 'PENDENTE', overdue: false, floors: [{ id: 'f1', label: '3º Andar' }],
        }],
      },
    };
    const { container } = render(<CalendarioDoPainel buildingId="p1" />);
    await user.click(container.querySelector(`[data-date="${chave(12)}"]`));
    const caixa = await screen.findByRole('dialog');
    expect(within(caixa).getByText('Carlos Andrade')).toBeInTheDocument();
    await user.click(within(caixa).getByRole('button', { name: /^Editar agendamento de Carlos Andrade/ }));
    expect(mockPush).toHaveBeenCalledWith(`/desktop/visualizacao/agenda?data=${chave(12)}&agendamento=s1`);
  });
});
