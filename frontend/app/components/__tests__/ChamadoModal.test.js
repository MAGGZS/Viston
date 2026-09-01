import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChamadoModal } from '@/app/components/ChamadoModal';
import { useUnsavedStore } from '@/app/store/unsaved';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
import api from '../../lib/api';

const TICKET = {
  id: 't1',
  status: 'EM_ANDAMENTO',
  floor: { label: '3º andar' },
  maintenance_type: 'ELETRICA',
  category: 'CORRETIVA',
  priority: 'ALTA',
  description: 'Lâmpada do corredor',
  responsible: 'Ana',
  responsible_id: 'u1',
  maintenance_note: null,
  maintenance_cost: null,
  report: { id: 'r1', date: '2026-08-20', building: { name: 'Aurora' } },
};

function Caixa({ ticket = TICKET, onClose = () => {} }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <ChamadoModal ticket={ticket} buildingId="p1" open onClose={onClose} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
  // O endpoint de responsáveis devolve a lista crua, e o componente a mapeia.
  api.get.mockResolvedValue({ data: [] });
  useUnsavedStore.setState({ dirty: [], pending: null });
});

describe('ChamadoModal', () => {
  it('não tem nada pendente enquanto ninguém escreve', async () => {
    render(<Caixa />);
    await screen.findByText('Notas para o responsável');

    expect(useUnsavedStore.getState().dirty).toHaveLength(0);
  });

  /**
   * O que vai ao servidor é o texto aparado. Enquanto o campo continuava com o
   * espaço no fim, ele nunca mais se igualava à nota do chamado, e a caixa se
   * despedia com "descartar alterações?" toda vez — com a nota já salva. A
   * mesma armadilha valia para o valor da manutenção, em ChamadosBoard.
   */
  it('fica limpa depois de salvar, mesmo com o texto tendo sido aparado', async () => {
    const user = userEvent.setup();
    api.patch.mockResolvedValue({ data: {} });
    render(<Caixa />);

    const campo = await screen.findByRole('textbox');
    await user.type(campo, 'trocar a lâmpada  ');
    expect(useUnsavedStore.getState().dirty).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Salvar nota' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/tickets/t1', {
      maintenance_note: 'trocar a lâmpada',
    }));
    await waitFor(() => expect(useUnsavedStore.getState().dirty).toHaveLength(0));
    expect(campo).toHaveValue('trocar a lâmpada');
  });

  /**
   * A conclusão informada tranca a linha do tempo. Sem esta saída, a única
   * forma de destravá-la seria reencaminhar — que zera o recebimento e faz o
   * chamado parecer novo para quem já estava nele.
   */
  it('em execução não oferece cancelar a conclusão — não há conclusão a desfazer', async () => {
    render(<Caixa />);
    await screen.findByText('Notas para o responsável');

    expect(screen.queryByRole('button', { name: /Cancelar conclusão/ })).not.toBeInTheDocument();
  });

  it('concluído pelo responsável, o moderador pode devolver o chamado ao andamento', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: {} });
    render(<Caixa ticket={{ ...TICKET, status: 'AGUARDANDO_FECHAMENTO', done_at: '2026-08-21T17:00:00.000Z' }} />);

    await user.click(await screen.findByRole('button', { name: /Cancelar conclusão/ }));

    expect(api.post).toHaveBeenCalledWith('/tickets/t1/undone');
  });
});
