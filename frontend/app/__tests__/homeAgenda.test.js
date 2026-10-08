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
  // De um colega do mesmo prédio: aparece, só para leitura.
  agendamento('c22', dia(22), { inspector: { id: 'u9', name: 'Carlos Lima' }, floors: [{ id: 'f9', label: '9º Andar' }] }),
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
    // O calendário do inspetor é o do prédio inteiro, mês a mês.
    if (url === '/buildings/p1/schedules') {
      const lista = params.month === PM && params.year === PY ? DO_PROXIMO : params.month === M ? DESTE_MES : [];
      return Promise.resolve({ data: { schedules: lista } });
    }
    // Os pendentes dele, sem mês — o número "Pendentes" do cartão.
    if (url === '/me/schedules') {
      return Promise.resolve({ data: { schedules: params.status === 'PENDENTE' ? [DESTE_MES[0], DESTE_MES[1]] : [] } });
    }
    if (url === '/inspections') {
      return Promise.resolve({ data: { inspections: [{ id: 'r1', date: dia(15), floor_form_entries: [{}, {}] }], total: 1 } });
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
    // Cada prédio tem a sua agenda: o escolhido vai em toda consulta.
    expect(api.get).toHaveBeenCalledWith('/buildings/p1/schedules', { params: { month: M, year: Y } });
    expect(api.get).toHaveBeenCalledWith('/me/notifications', { params: { limit: 20, building_id: 'p1' } });
  });

  it('clicar num dia com agendamento abre os detalhes, com acesso às vistorias feitas', async () => {
    const user = userEvent.setup();
    montarTela();
    await waitFor(() => expect(botaoDoDia(15, '2 vistorias feitas')).toBeInTheDocument());
    await user.click(botaoDoDia(15));

    const caixa = await screen.findByRole('dialog', { name: /Agenda de 15 de/ });
    expect(within(caixa).getByText('3º Andar')).toBeInTheDocument();
    // O prédio é o escolhido na tela e o agendamento é dele: nem um nem outro nome.
    expect(within(caixa).queryByText('Edifício Aurora')).not.toBeInTheDocument();
    expect(within(caixa).queryByText('Marina Alves')).not.toBeInTheDocument();
    expect(within(caixa).getByText('Conferir a casa de máquinas')).toBeInTheDocument();
    // O inspetor não edita.
    expect(within(caixa).queryByRole('button', { name: /Editar agendamento/ })).not.toBeInTheDocument();

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
    expect(within(caixa).getByText('3º Andar')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/buildings/p1/schedules', { params: { month: PM, year: PY } });
  });

  it('aviso de cancelamento mostra os dados do próprio aviso, e não um dia vazio', async () => {
    const user = userEvent.setup();
    const cancelado = {
      ...NOTIFICACAO,
      id: 'n2',
      type: 'SCHEDULE_CANCELED',
      payload: { ...NOTIFICACAO.payload, schedule_id: 'sumiu', building_name: 'Edifício Norte', floors: [{ label: '7º Andar' }] },
    };
    montarTela();
    api.get.mockImplementation((url, config = {}) => {
      const params = config.params ?? {};
      if (url === '/buildings/me') return Promise.resolve({ data: [PREDIO] });
      if (url === '/me/notifications') return Promise.resolve({ data: { notifications: [cancelado], unread: 1 } });
      if (url === '/buildings/p1/schedules') return Promise.resolve({ data: { schedules: params.month === PM ? [] : DESTE_MES } });
      if (url === '/me/schedules') return Promise.resolve({ data: { schedules: [] } });
      return Promise.resolve({ data: { heatmap: {} } });
    });
    await user.click(await screen.findByRole('button', { name: 'Notificações, 1 não lida' }));
    await user.click(await screen.findByRole('button', { name: /Vistoria cancelada/ }));

    const caixa = await screen.findByRole('dialog', { name: 'Agendamento cancelado' });
    expect(within(caixa).getByText('7º Andar')).toBeInTheDocument();
    expect(within(caixa).getByText('Cancelada')).toBeInTheDocument();
    // Na própria agenda, o nome do inspetor é ruído.
    expect(within(caixa).queryByText('Marina Alves')).not.toBeInTheDocument();
    expect(within(caixa).queryByText(/Nenhuma vistoria agendada/)).not.toBeInTheDocument();
  });

  it('mostra os agendamentos dos colegas, menores e com o nome de quem vai', async () => {
    const user = userEvent.setup();
    montarTela();
    await waitFor(() => expect(botaoDoDia(22)).toHaveAccessibleName(expect.stringMatching(/1 agendamento, 1 de colega$/)));
    await user.click(botaoDoDia(22));
    const caixa = await screen.findByRole('dialog', { name: /Agenda de 22 de/ });
    expect(within(caixa).getByText('Carlos Lima')).toBeInTheDocument();
    expect(screen.getByText('De um colega')).toBeInTheDocument();
  });

  it('para quem vistoria no prédio, os números do cartão são os dele', async () => {
    montarTela();
    const minhas = await screen.findByText('Minhas vistorias');
    await waitFor(() => expect(minhas.parentElement).toHaveTextContent('1'));
    expect(screen.getByText('Andares').parentElement).toHaveTextContent('2');
    await waitFor(() => expect(screen.getByText('Pendentes').parentElement).toHaveTextContent('2'));
    expect(api.get).toHaveBeenCalledWith('/me/schedules', { params: { building_id: 'p1', status: 'PENDENTE' } });
    expect(api.get).toHaveBeenCalledWith('/inspections', {
      params: expect.objectContaining({ building_id: 'p1', inspector_id: 'u1' }),
    });
  });

  it('sem conseguir a agenda, o aviso do sino ainda abre, com os dados dele e "Tentar de novo"', async () => {
    const user = userEvent.setup();
    montarTela();
    api.get.mockImplementation((url) => {
      if (url === '/buildings/me') return Promise.resolve({ data: [PREDIO] });
      if (url === '/me/notifications') return Promise.resolve({ data: { notifications: [NOTIFICACAO], unread: 1 } });
      if (url === '/buildings/p1/schedules') return Promise.reject(new Error('fora do ar'));
      return Promise.resolve({ data: { heatmap: {}, schedules: [] } });
    });
    await user.click(await screen.findByRole('button', { name: 'Notificações, 1 não lida' }));
    await user.click(await screen.findByRole('button', { name: /Nova vistoria agendada/ }));

    const caixa = await screen.findByRole('dialog', { name: 'Vistoria agendada' });
    expect(within(caixa).getByText(/Não foi possível carregar sua agenda/)).toBeInTheDocument();
    expect(within(caixa).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
