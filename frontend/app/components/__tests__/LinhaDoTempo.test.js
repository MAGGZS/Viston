import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LinhaDoTempo, temLinhaDoTempo } from '@/app/components/LinhaDoTempo';
import { useAuthStore } from '@/app/store/auth';

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../../lib/api';

const EU = 'u-marina';

const TICKET = {
  id: 't1',
  status: 'EM_ANDAMENTO',
  responsible_id: EU,
  done_at: null,
  done_report: null,
  closed_at: null,
  closed_by: null,
  maintenance_note: null,
};

/**
 * O instante escrito pelo relógio de quem lê.
 *
 * A API devolve UTC e a tela mostra a hora local. Fixar o texto ISO aqui
 * amarraria o teste ao fuso da máquina que o roda — e a hora esperada mudaria
 * de 09:05 para 12:05 num CI em UTC, sem nada estar errado.
 */
const local = (ano, mes, dia, hora, minuto) => new Date(ano, mes - 1, dia, hora, minuto).toISOString();

/** Duas anotações no mesmo dia, uma no dia seguinte — o caso que agrupa. */
const UPDATES = [
  {
    id: 'a1',
    description: 'Abri o forro e achei a válvula travada',
    photos: [],
    author: 'Marina',
    author_id: EU,
    author_avatar: null,
    created_at: local(2026, 8, 20, 9, 5),
    edited_at: null,
  },
  {
    id: 'a2',
    description: 'Comprei a peça. Chega amanhã.',
    photos: [],
    author: 'Marina',
    author_id: EU,
    author_avatar: null,
    created_at: local(2026, 8, 20, 16, 40),
    edited_at: null,
  },
  {
    id: 'a3',
    description: 'Troquei a válvula e testei por 20 minutos.',
    photos: ['https://bucket/ticket_foto.jpg'],
    author: 'Marina',
    author_id: EU,
    author_avatar: null,
    created_at: local(2026, 8, 21, 10, 10),
    edited_at: null,
  },
];

function Linha({ ticket = TICKET, podeEscrever = false }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <LinhaDoTempo ticket={ticket} podeEscrever={podeEscrever} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { updates: UPDATES } });
  useAuthStore.setState({ user: { id: EU, name: 'Marina' } });
});

describe('temLinhaDoTempo', () => {
  it('vale onde existe manutenção a contar, e não antes do recebimento', () => {
    expect(temLinhaDoTempo('EM_ANDAMENTO')).toBe(true);
    expect(temLinhaDoTempo('AGUARDANDO_TERCEIRO')).toBe(true);
    expect(temLinhaDoTempo('AGUARDANDO_FECHAMENTO')).toBe(true);
    expect(temLinhaDoTempo('CONCLUIDO')).toBe(true);

    expect(temLinhaDoTempo('ABERTO')).toBe(false);
    expect(temLinhaDoTempo('ENCAMINHADO')).toBe(false);
  });
});

describe('LinhaDoTempo', () => {
  it('não desenha nada no chamado que ainda não tem o que contar', () => {
    const { container } = render(<Linha ticket={{ ...TICKET, status: 'ENCAMINHADO' }} />);

    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('agrupa por dia e abre cada passo pela hora', async () => {
    render(<Linha />);
    await screen.findByText('Abri o forro e achei a válvula travada');

    // O que dá estrutura é o dia: ninguém procura "a terceira atualização".
    expect(screen.getByText('Quinta-feira, 20 de agosto')).toBeInTheDocument();
    expect(screen.getByText('Sexta-feira, 21 de agosto')).toBeInTheDocument();

    // Um cabeçalho por dia, e não um por anotação — as duas do dia 20 dividem.
    expect(screen.queryAllByText(/de agosto$/)).toHaveLength(2);

    expect(screen.getByText('09:05')).toBeInTheDocument();
    expect(screen.getByText('16:40')).toBeInTheDocument();
    expect(screen.getByText('10:10')).toBeInTheDocument();
  });

  it('mostra as fotos do passo como miniaturas que abrem', async () => {
    render(<Linha />);
    await screen.findByText('Troquei a válvula e testei por 20 minutos.');

    expect(screen.getByRole('button', { name: 'Ver foto 1 de 1' })).toBeInTheDocument();
  });

  it('fecha a linha com a conclusão informada e o relato do responsável', async () => {
    render(
      <Linha
        ticket={{
          ...TICKET,
          status: 'AGUARDANDO_FECHAMENTO',
          done_at: local(2026, 8, 21, 14, 0),
          done_report: 'Válvula trocada, sem vazamento.',
        }}
      />
    );

    expect(await screen.findByText('Conclusão informada')).toBeInTheDocument();
    expect(screen.getByText('Válvula trocada, sem vazamento.')).toBeInTheDocument();
  });

  it('fecha a linha no fechamento do moderador, dizendo quem fechou', async () => {
    render(
      <Linha
        ticket={{
          ...TICKET,
          status: 'CONCLUIDO',
          done_at: local(2026, 8, 21, 14, 0),
          closed_at: local(2026, 8, 22, 11, 0),
          closed_by: { name: 'Rui' },
          // A anotação do moderador não vira passo: ela pode ter sido escrita
          // no meio da execução, e tem bloco próprio nas caixas.
          maintenance_note: 'Nota que não é o fechamento',
        }}
      />
    );

    expect(await screen.findByText('Finalizado por Rui')).toBeInTheDocument();
    expect(screen.queryByText('Nota que não é o fechamento')).not.toBeInTheDocument();
  });

  it('sem permissão de escrita, não oferece onde escrever', async () => {
    render(<Linha />);
    await screen.findByText('Abri o forro e achei a válvula travada');

    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    expect(screen.queryByText('O que foi feito agora?')).not.toBeInTheDocument();
  });

  it('quem escreve ganha o compositor no fim do fio', async () => {
    render(<Linha podeEscrever />);
    await screen.findByText('Abri o forro e achei a válvula travada');

    expect(screen.getByText('O que foi feito agora?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
  });

  it('editar e apagar existem só na última anotação', async () => {
    render(<Linha podeEscrever />);
    await screen.findByText('Troquei a válvula e testei por 20 minutos.');

    // O que já tem outra linha embaixo foi lido — reescrevê-lo faria o registro
    // deixar de valer como registro.
    expect(screen.getAllByRole('button', { name: /Editar/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Apagar/ })).toHaveLength(1);
  });

  it('não oferece alterar a última anotação escrita por outra pessoa', async () => {
    api.get.mockResolvedValue({
      data: { updates: [...UPDATES.slice(0, 2), { ...UPDATES[2], author_id: 'u-outro', author: 'Rui' }] },
    });

    render(<Linha podeEscrever />);
    await screen.findByText('Troquei a válvula e testei por 20 minutos.');

    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('no chamado fechado ninguém escreve nem altera', async () => {
    render(
      <Linha
        podeEscrever
        ticket={{ ...TICKET, status: 'CONCLUIDO', closed_at: local(2026, 8, 22, 11, 0) }}
      />
    );
    await screen.findByText('Troquei a válvula e testei por 20 minutos.');

    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('a linha vazia diz o que falta a quem pode escrever', async () => {
    api.get.mockResolvedValue({ data: { updates: [] } });

    render(<Linha podeEscrever />);

    expect(
      await screen.findByText(/A primeira anotação abre a linha do tempo/)
    ).toBeInTheDocument();
  });

  it('a linha vazia diz outra coisa a quem só lê', async () => {
    api.get.mockResolvedValue({ data: { updates: [] } });

    render(<Linha />);

    expect(
      await screen.findByText('O responsável ainda não registrou nenhum passo desta manutenção.')
    ).toBeInTheDocument();
  });
});
