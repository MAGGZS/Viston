import { render, screen, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/desktop/inspetor',
  useSearchParams: () => new URLSearchParams(),
}));

// Caminho relativo: o `jest.mock` é içado para antes do mapeamento de alias.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import InspetorDesktopPage from '@/app/desktop/inspetor/page';
import { numerosDoMes, ordenarProximos, prazoRelativo } from '@/app/desktop/inspetor/proximos';
import { useAuthStore } from '@/app/store/auth';
import { esquecerAbaAnterior } from '@/app/components/Sidebar';

const hoje = new Date();
const k = (n) => format(addDays(hoje, n), 'yyyy-MM-dd');

// O prédio é o escolhido no cabeçalho e não aparece na linha; o nome de cada
// agendamento vai no andar, que é o que a linha mostra como título.
const ag = (id, predio, { due, scheduled = due, status = 'PENDENTE', overdue = false, past_deadline = false } = {}) => ({
  id,
  building_id: 'p1',
  building_name: 'Aurora',
  inspector: { id: 'u1', name: 'Marina Alves' },
  scheduled_date: scheduled,
  due_date: due,
  status,
  overdue,
  past_deadline,
  floors: [{ id: `f-${id}`, label: predio }],
});

// Fora de ordem de propósito.
const TODOS = [
  ag('longe', 'Torre Longe', { due: k(20) }),
  ag('feito', 'Torre Feita', { due: k(1), status: 'CONCLUIDO' }),
  // Passou do dia agendado, ainda dentro do "até quando": atrasado.
  ag('atrasoRecente', 'Torre Atraso Recente', { scheduled: k(-1), due: k(3), overdue: true }),
  ag('perto', 'Torre Perto', { due: k(2) }),
  // Passou também do limite final: prazo vencido.
  ag('atrasoAntigo', 'Torre Atraso Antigo', { scheduled: k(-8), due: k(-5), overdue: true, past_deadline: true }),
];

const INSPECOES = {
  inspections: [
    { id: 'r1', date: '2026-10-01T00:00:00.000Z', floor_form_entries: [{}, {}, {}] },
    { id: 'r2', date: '2026-10-01T00:00:00.000Z', floor_form_entries: [{}, {}] },
    { id: 'r3', date: '2026-10-02T00:00:00.000Z', floor_form_entries: [{}] },
  ],
  total: 3,
};

function montarTela() {
  window.matchMedia = (query) => ({
    matches: query.includes('1024'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useAuthStore.setState({
    user: {
      id: 'u1', kind: 'USER', role: 'NONE', name: 'Marina Alves',
      memberships: [{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }],
    },
    isLoading: false,
  });

  api.get.mockImplementation((url, config = {}) => {
    const params = config.params ?? {};
    if (url === '/buildings/me') {
      return Promise.resolve({ data: [{ building_id: 'p1', name: 'Aurora', role: 'INSPECTOR' }] });
    }
    if (url === '/me/schedules') {
      // Sem mês, só os pendentes (`status=PENDENTE`) — o servidor recorta.
      return Promise.resolve({ data: { schedules: params.month ? [] : TODOS.filter((s) => s.status === params.status) } });
    }
    // O calendário do inspetor mostra o prédio inteiro, mês a mês.
    if (url === '/buildings/p1/schedules') return Promise.resolve({ data: { schedules: [] } });
    if (url === '/inspections') return Promise.resolve({ data: INSPECOES });
    if (url === '/calendar') return Promise.resolve({ data: { heatmap: {} } });
    if (url === '/me/notifications') return Promise.resolve({ data: { notifications: [], unread: 0 } });
    return Promise.resolve({ data: {} });
  });

  return render(
    <QueryClientProvider client={client}>
      <InspetorDesktopPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  esquecerAbaAnterior();
  api.get.mockReset();
});

describe('mesa do inspetor no computador', () => {
  it('mostra os números do mês do próprio inspetor', async () => {
    montarTela();
    expect(await screen.findByRole('heading', { name: /Olá, Marina/ })).toBeInTheDocument();

    const numeros = screen.getByRole('region', { name: /Seu mês/ });
    await waitFor(() => expect(within(numeros).getByText('Vistorias').closest('div').parentElement).toHaveTextContent('3'));
    expect(within(numeros).getByText('Andares vistoriados').closest('div').parentElement).toHaveTextContent('6');
    expect(within(numeros).getByText('Dias em campo').closest('div').parentElement).toHaveTextContent('2');
    expect(within(numeros).getByText('Pendentes').closest('div').parentElement).toHaveTextContent('4');
    expect(within(numeros).getByText('2 atrasadas')).toBeInTheDocument();

    expect(api.get).toHaveBeenCalledWith('/inspections', {
      params: expect.objectContaining({ building_id: 'p1', inspector_id: 'u1', limit: 100 }),
    });
  });

  it('fala só do prédio escolhido: agenda, sino e números levam o building_id', async () => {
    montarTela();
    await screen.findByRole('list', { name: 'Próximos agendamentos' });
    // Duas consultas, as duas recortadas: os pendentes dele (sem mês) e o mês
    // do prédio para o calendário.
    expect(api.get).toHaveBeenCalledWith('/me/schedules', { params: { building_id: 'p1', status: 'PENDENTE' } });
    expect(api.get).toHaveBeenCalledWith('/buildings/p1/schedules', {
      params: expect.objectContaining({ month: expect.any(Number) }),
    });
    expect(api.get).not.toHaveBeenCalledWith('/me/schedules', { params: { building_id: 'p1' } });
    expect(api.get).toHaveBeenCalledWith('/me/notifications', {
      params: expect.objectContaining({ building_id: 'p1' }),
    });
    expect(api.get).toHaveBeenCalledWith('/calendar', {
      params: expect.objectContaining({ building_id: 'p1' }),
    });
  });

  it('ordena os próximos (prazo vencido, atrasado, depois o dia mais próximo) sem repetir o destaque', async () => {
    montarTela();
    const lista = await screen.findByRole('list', { name: 'Próximos agendamentos' });
    const nomes = within(lista).getAllByRole('button').map((b) => b.textContent);
    // O primeiro ("Torre Atraso Antigo") já está no cartão "Próximo prazo".
    expect(nomes.map((t) => t.match(/Torre [A-Za-z ]+?(?=Agendada)/)?.[0].trim())).toEqual([
      'Torre Atraso Recente',
      'Torre Perto',
      'Torre Longe',
    ]);
    // O concluído não é "próximo".
    expect(within(lista).queryByText('Torre Feita')).not.toBeInTheDocument();
  });

  it('destaca o prazo mais urgente', async () => {
    montarTela();
    const destaque = await screen.findByRole('region', { name: 'Próximo prazo' });
    expect(within(destaque).getByText('Torre Atraso Antigo')).toBeInTheDocument();
    expect(within(destaque).getByText('Prazo vencido há 5 dias')).toBeInTheDocument();
  });

  it('não mostra a tabela de vistorias recentes', async () => {
    montarTela();
    await screen.findByRole('list', { name: 'Próximos agendamentos' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('contas da mesa do inspetor', () => {
  it('ordenarProximos tira concluídos e cancelados', () => {
    const lista = ordenarProximos([
      ag('a', 'A', { due: k(3) }),
      ag('b', 'B', { due: k(1), status: 'CANCELADO' }),
      ag('c', 'C', { due: k(1) }),
    ]);
    expect(lista.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('prazoRelativo segue a regra: atrasada desde o dia agendado, prazo vencido depois do limite', () => {
    const base = new Date(2026, 9, 7, 15, 0);
    const s = (scheduled_date, due_date) => ({ scheduled_date, due_date });
    // Antes do dia agendado: quanto falta para ele.
    expect(prazoRelativo(s('2026-10-07', '2026-10-07'), base)).toBe('Agendada para hoje');
    expect(prazoRelativo(s('2026-10-08', '2026-10-08'), base)).toBe('Agendada para amanhã');
    expect(prazoRelativo(s('2026-10-09', '2026-10-11'), base)).toBe('Agendada para daqui a 2 dias');
    expect(prazoRelativo(s('2026-10-06', '2026-10-10'), base)).toBe('Atrasada há 1 dia');
    expect(prazoRelativo(s('2026-10-02', '2026-10-10'), base)).toBe('Atrasada há 5 dias');
    expect(prazoRelativo(s('2026-10-01', '2026-10-06'), base)).toBe('Prazo vencido há 1 dia');
    expect(prazoRelativo(s('2026-10-01', '2026-10-04'), base)).toBe('Prazo vencido há 3 dias');
    // Data solta continua lida como o limite.
    expect(prazoRelativo('2026-10-04', base)).toBe('Prazo vencido há 3 dias');
  });

  it('ordenarProximos, no mesmo estado, vai pelo dia agendado e desempata pelo prazo', () => {
    const lista = ordenarProximos([
      ag('tarde', 'T', { scheduled: k(5), due: k(6) }),
      ag('cedoLongo', 'L', { scheduled: k(2), due: k(9) }),
      ag('cedoCurto', 'C', { scheduled: k(2), due: k(3) }),
    ]);
    expect(lista.map((x) => x.id)).toEqual(['cedoCurto', 'cedoLongo', 'tarde']);
  });

  it('ordenarProximos põe prazo vencido antes de atrasado, e atrasado antes de pendente', () => {
    const lista = ordenarProximos([
      ag('pend', 'P', { due: k(1) }),
      ag('atr', 'A', { scheduled: k(-2), due: k(5), overdue: true }),
      ag('venc', 'V', { scheduled: k(-9), due: k(-3), overdue: true, past_deadline: true }),
    ]);
    expect(lista.map((x) => x.id)).toEqual(['venc', 'atr', 'pend']);
  });

  it('numerosDoMes não inventa andares nem dias quando a página não trouxe o mês inteiro', () => {
    expect(numerosDoMes(INSPECOES.inspections, 3)).toEqual({ vistorias: 3, andares: 6, dias: 2 });
    expect(numerosDoMes(INSPECOES.inspections, 140)).toEqual({ vistorias: 140, andares: null, dias: null });
  });
});
