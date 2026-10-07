import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificacoesSino } from '@/app/components/NotificacoesSino';

// Caminho relativo: o `jest.mock` é içado para antes do mapeamento de alias.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
}));
import api from '../../lib/api';

/**
 * O sino geral: contador de não lidas, texto em português por tipo, marcar
 * como lida no clique e "marcar todas".
 */
const PAYLOAD = {
  schedule_id: 's1',
  building_name: 'Edifício Aurora',
  scheduled_date: '2026-10-07',
  due_date: '2026-10-12',
  floors: [{ id: 'f3', label: '3º Andar' }, { id: 'f4', label: '4º Andar' }],
};

const NOTIFICATIONS = [
  { id: 'n1', type: 'SCHEDULE_CREATED', payload: PAYLOAD, read_at: null, created_at: new Date().toISOString(), building_id: 'p1' },
  { id: 'n2', type: 'SCHEDULE_OVERDUE', payload: PAYLOAD, read_at: null, created_at: new Date().toISOString(), building_id: 'p1' },
  { id: 'n3', type: 'SCHEDULE_CANCELED', payload: PAYLOAD, read_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T09:00:00Z', building_id: 'p1' },
];

function renderSino(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificacoesSino {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  api.get.mockResolvedValue({ data: { notifications: NOTIFICATIONS, unread: 2 } });
  api.patch.mockResolvedValue({ data: undefined, status: 204 });
});

describe('NotificacoesSino', () => {
  it('mostra o contador de não lidas no nome do botão', async () => {
    renderSino();
    expect(await screen.findByRole('button', { name: 'Notificações, 2 não lidas' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/me/notifications', { params: { limit: 20 } });
  });

  it('abre a lista com texto amigável por tipo', async () => {
    const user = userEvent.setup();
    renderSino();
    await user.click(await screen.findByRole('button', { name: /Notificações, 2/ }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Notificações');
    expect(screen.getByText('Nova vistoria agendada')).toBeInTheDocument();
    expect(screen.getByText('Vistoria atrasada')).toBeInTheDocument();
    expect(screen.getByText('Vistoria cancelada')).toBeInTheDocument();
    expect(screen.getAllByText('Edifício Aurora, 3º Andar e 4º Andar, até 12/10')).toHaveLength(3);
  });

  it('marca como lida ao clicar e chama onOpenSchedule com o payload', async () => {
    const user = userEvent.setup();
    const onOpenSchedule = jest.fn();
    renderSino({ onOpenSchedule });
    await user.click(await screen.findByRole('button', { name: /Notificações, 2/ }));
    await user.click(screen.getByRole('button', { name: /Nova vistoria agendada/ }));

    expect(api.patch).toHaveBeenCalledWith('/me/notifications/n1/read');
    expect(onOpenSchedule).toHaveBeenCalledWith(PAYLOAD, expect.objectContaining({ id: 'n1' }));
  });

  it('não pede para marcar de novo o que já foi lido', async () => {
    const user = userEvent.setup();
    renderSino();
    await user.click(await screen.findByRole('button', { name: /Notificações, 2/ }));
    await user.click(screen.getByRole('button', { name: /Vistoria cancelada/ }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('marca todas como lidas e zera o contador na hora', async () => {
    const user = userEvent.setup();
    renderSino();
    await user.click(await screen.findByRole('button', { name: /Notificações, 2/ }));
    // O que o servidor devolve depois do PATCH, quando o cache é revalidado.
    const lidas = NOTIFICATIONS.map((n) => ({ ...n, read_at: n.read_at ?? '2026-10-07T12:00:00Z' }));
    api.get.mockResolvedValue({ data: { notifications: lidas, unread: 0 } });
    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));
    expect(api.patch).toHaveBeenCalledWith('/me/notifications/read-all');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).not.toBeInTheDocument()
    );
  });

  it('sem avisos, diz que não há nada', async () => {
    api.get.mockResolvedValue({ data: { notifications: [], unread: 0 } });
    const user = userEvent.setup();
    renderSino();
    await user.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(screen.getByText(/Nenhuma notificação por enquanto/)).toBeInTheDocument();
  });

  it('passa no axe com a lista aberta', async () => {
    const user = userEvent.setup();
    const { container } = renderSino();
    await user.click(await screen.findByRole('button', { name: /Notificações, 2/ }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
