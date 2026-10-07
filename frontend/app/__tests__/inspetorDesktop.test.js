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

const ag = (id, predio, { due, scheduled = due, status = 'PENDENTE', overdue = false } = {}) => ({
  id,
  building_id: `b-${id}`,
  building_name: predio,
  inspector: { id: 'u1', name: 'Marina Alves' },
  scheduled_date: scheduled,
  due_date: due,
  status,
  overdue,
  floors: [{ id: `f-${id}`, label: '2º Andar' }],
});

// Fora de ordem de propósito.
const TODOS = [
  ag('longe', 'Torre Longe', { due: k(20) }),
  ag('feito', 'Torre Feita', { due: k(1), status: 'CONCLUIDO' }),
  ag('atrasoRecente', 'Torre Atraso Recente', { due: k(-1), overdue: true }),
  ag('perto', 'Torre Perto', { due: k(2) }),
  ag('atrasoAntigo', 'Torre Atraso Antigo', { due: k(-5), overdue: true }),
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
    if (url === '/me/schedules') {
      return Promise.resolve({ data: { schedules: params.month ? [] : TODOS } });
    }
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
    expect(within(numeros).getByText('2 atrasados')).toBeInTheDocument();

    expect(api.get).toHaveBeenCalledWith('/inspections', {
      params: expect.objectContaining({ inspector_id: 'u1', limit: 100 }),
    });
  });

  it('ordena os próximos: atrasados primeiro, depois o prazo mais próximo', async () => {
    montarTela();
    const lista = await screen.findByRole('list', { name: 'Próximos agendamentos' });
    const nomes = within(lista).getAllByRole('button').map((b) => b.textContent);
    expect(nomes.map((t) => t.match(/Torre [A-Za-z ]+?(?=2º)/)?.[0].trim())).toEqual([
      'Torre Atraso Antigo',
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
    expect(within(destaque).getByText('Venceu há 5 dias')).toBeInTheDocument();
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

  it('prazoRelativo fala em dias de calendário', () => {
    const base = new Date(2026, 9, 7, 15, 0);
    expect(prazoRelativo('2026-10-07', base)).toBe('Vence hoje');
    expect(prazoRelativo('2026-10-08', base)).toBe('Vence amanhã');
    expect(prazoRelativo('2026-10-11', base)).toBe('Vence em 4 dias');
    expect(prazoRelativo('2026-10-06', base)).toBe('Venceu ontem');
    expect(prazoRelativo('2026-10-04', base)).toBe('Venceu há 3 dias');
  });

  it('numerosDoMes não inventa andares nem dias quando a página não trouxe o mês inteiro', () => {
    expect(numerosDoMes(INSPECOES.inspections, 3)).toEqual({ vistorias: 3, andares: 6, dias: 2 });
    expect(numerosDoMes(INSPECOES.inspections, 140)).toEqual({ vistorias: 140, andares: null, dias: null });
  });
});
