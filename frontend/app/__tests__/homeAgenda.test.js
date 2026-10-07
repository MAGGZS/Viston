import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

// Caminho relativo: o `jest.mock` é içado para antes do mapeamento de alias.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import HomePage from '@/app/home/page';
import { useAuthStore } from '@/app/store/auth';

const hoje = new Date();
const Y = hoje.getFullYear();
const M = hoje.getMonth() + 1;
const MM = String(M).padStart(2, '0');
// O nome do mês entra na busca: a grade mostra também o começo do mês seguinte,
// e "10 de" sozinho casaria com dois dias.
const NOME_DO_MES = format(hoje, 'MMMM', { locale: ptBR });
const dia = (d, m = MM, y = Y) => `${y}-${m}-${String(d).padStart(2, '0')}`;

const proximo = new Date(Y, M, 1); // primeiro dia do mês seguinte
const PM = proximo.getMonth() + 1;
const PY = proximo.getFullYear();
const PMM = String(PM).padStart(2, '0');

const PREDIO = { building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' };

const agendamento = (id, data, extra = {}) => ({
  id,
  building_id: 'p1',
  building_name: 'Edifício Aurora',
  inspector: { id: 'u1', name: 'Marina Alves' },
  scheduled_date: data,
  due_date: data,
  status: 'PENDENTE',
  overdue: false,
  notes: null,
  floors: [{ id: 'f3', label: '3º Andar' }],
  ...extra,
});

// Dia 15: agendamento e vistorias feitas. Dia 10: só agendamento. Dia 20: só vistorias.
const DESTE_MES = [
  agendamento('s15', dia(15), { notes: 'Conferir a casa de máquinas' }),
  agendamento('s10', dia(10), { building_name: 'Torre Sul' }),
];
const DO_PROXIMO = [agendamento('sN', dia(3, PMM, PY), { building_name: 'Edifício Norte' })];

const HEATMAP = {
  [dia(15)]: { count: 2, inspectors: ['Marina Alves'], reports: [{ id: 'r15', inspector: 'Marina Alves' }] },
  [dia(20)]: { count: 1, inspectors: ['Carlos'], reports: [{ id: 'r20', inspector: 'Carlos' }] },
};

const NOTIFICACAO = {
  id: 'n1',
  type: 'SCHEDULE_CREATED',
  read_at: null,
  created_at: new Date().toISOString(),
  payload: { schedule_id: 'sN', building_name: 'Edifício Norte', scheduled_date: dia(3, PMM, PY), due_date: dia(3, PMM, PY), floors: [] },
};

function montarTela() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({
    user: { id: 'u1', kind: 'USER', role: 'NONE', name: 'Marina Alves', memberships: [PREDIO] },
    isLoading: false,
  });

  api.get.mockImplementation((url, config = {}) => {
    const params = config.params ?? {};
    if (url === '/buildings/me') return Promise.resolve({ data: [PREDIO] });
    if (url === '/me/schedules') {
      const lista = params.month === PM && params.year === PY ? DO_PROXIMO : params.month === M ? DESTE_MES : [];
      return Promise.resolve({ data: { schedules: lista } });
    }
    if (url === '/calendar') return Promise.resolve({ data: { heatmap: params.month === M ? HEATMAP : {} } });
    if (url === '/me/notifications') return Promise.resolve({ data: { notifications: [NOTIFICACAO], unread: 1 } });
    // O relatório do dia não precisa chegar: basta a caixa abrir.
    if (url.startsWith('/inspections/')) return new Promise(() => {});
    return Promise.resolve({ data: {} });
  });
  api.patch.mockResolvedValue({ data: undefined });

  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>
  );
}

const botaoDoDia = (d, extra = '') => screen.getByRole('button', { name: new RegExp(`(^|\\s)${d} de ${NOME_DO_MES} de ${Y}.*${extra}`) });

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
});

describe('home do inspetor: calendário da agenda', () => {
  it('marca os dias com agendamento e os dias com vistoria feita', async () => {
    montarTela();
    await waitFor(() => expect(botaoDoDia(15, '1 agendamento')).toBeInTheDocument());

    // Agendamento + vistorias feitas no mesmo dia: as duas coisas no nome.
    expect(botaoDoDia(15)).toHaveAccessibleName(expect.stringMatching(/1 agendamento, 2 vistorias feitas/));
    expect(botaoDoDia(10)).toHaveAccessibleName(expect.stringMatching(/1 agendamento$/));
    await waitFor(() => expect(botaoDoDia(20)).toHaveAccessibleName(expect.stringMatching(/sem agendamentos, 1 vistoria feita/)));
    expect(api.get).toHaveBeenCalledWith('/me/schedules', { params: { month: M, year: Y } });
  });

  it('clicar num dia com agendamento abre os detalhes, com acesso às vistorias feitas', async () => {
    const user = userEvent.setup();
    montarTela();
    await waitFor(() => expect(botaoDoDia(15, '2 vistorias feitas')).toBeInTheDocument());
    await user.click(botaoDoDia(15));

    const caixa = await screen.findByRole('dialog', { name: /Agenda de 15 de/ });
    expect(within(caixa).getByText('Edifício Aurora')).toBeInTheDocument();
    expect(within(caixa).getByText('3º Andar')).toBeInTheDocument();
    expect(within(caixa).getByText('Conferir a casa de máquinas')).toBeInTheDocument();
    // O inspetor não edita.
    expect(within(caixa).queryByRole('button', { name: 'Editar agendamento' })).not.toBeInTheDocument();

    await user.click(within(caixa).getByRole('button', { name: 'Ver 2 vistorias feitas neste dia' }));
    expect(await screen.findByText(/vistorias? neste dia/)).toBeInTheDocument();
  });

  it('dia só com vistoria feita abre direto o relatório do dia, como antes', async () => {
    const user = userEvent.setup();
    montarTela();
    await waitFor(() => expect(botaoDoDia(20, '1 vistoria feita')).toBeInTheDocument());
    await user.click(botaoDoDia(20));
    expect(await screen.findByText('1 vistoria neste dia')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Agenda de/ })).not.toBeInTheDocument();
  });

  it('o aviso do sino leva ao mês e ao dia do agendamento', async () => {
    const user = userEvent.setup();
    montarTela();
    await user.click(await screen.findByRole('button', { name: 'Notificações, 1 não lida' }));
    await user.click(await screen.findByRole('button', { name: /Nova vistoria agendada/ }));

    const caixa = await screen.findByRole('dialog', { name: /Agenda de 3 de/ });
    expect(within(caixa).getByText('Edifício Norte')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/me/schedules', { params: { month: PM, year: PY } });
  });
});
