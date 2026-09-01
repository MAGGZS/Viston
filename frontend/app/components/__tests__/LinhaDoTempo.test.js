import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
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
  api.delete.mockReset();
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

  /**
   * A ordem de leitura.
   *
   * Quem abre um chamado que corre há dias quer saber em que pé ele está agora,
   * e não recomeçar a história do princípio. Ler do começo é a outra pergunta —
   * como chegamos aqui —, e para ela existe o controle.
   */
  describe('ordem', () => {
    /** Onde cada texto caiu na página, para comparar posições. */
    const posicao = (texto) => document.body.textContent.indexOf(texto);

    const PRIMEIRA = 'Abri o forro e achei a válvula travada';
    const ULTIMA = 'Troquei a válvula e testei por 20 minutos.';

    it('abre pelas mais recentes', async () => {
      render(<Linha />);
      await screen.findByText(ULTIMA);

      expect(posicao(ULTIMA)).toBeLessThan(posicao(PRIMEIRA));
      // O cabeçalho do dia acompanha: a sexta abre a lista, a quinta vem depois.
      expect(posicao('Sexta-feira, 21 de agosto')).toBeLessThan(posicao('Quinta-feira, 20 de agosto'));
    });

    it('o controle inverte a leitura', async () => {
      const user = userEvent.setup();
      render(<Linha />);
      await screen.findByText(ULTIMA);

      await user.click(screen.getByRole('button', { name: /Mostrando as mais recentes/ }));

      await waitFor(() => expect(posicao(PRIMEIRA)).toBeLessThan(posicao(ULTIMA)));
      expect(posicao('Quinta-feira, 20 de agosto')).toBeLessThan(posicao('Sexta-feira, 21 de agosto'));
      // E volta.
      await user.click(screen.getByRole('button', { name: /Mostrando as mais antigas/ }));
      await waitFor(() => expect(posicao(ULTIMA)).toBeLessThan(posicao(PRIMEIRA)));
    });

    it('o compositor acompanha a ordem — é onde a próxima anotação vai nascer', async () => {
      const user = userEvent.setup();
      render(<Linha podeEscrever />);
      await screen.findByText(ULTIMA);

      expect(posicao('O que foi feito agora?')).toBeLessThan(posicao(ULTIMA));

      await user.click(screen.getByRole('button', { name: /Mostrando as mais recentes/ }));

      await waitFor(() => expect(posicao('O que foi feito agora?')).toBeGreaterThan(posicao(ULTIMA)));
    });

    /**
     * Enquanto anotações e marcos eram desenhados em duas listas seguidas, o
     * marco caía sempre no fim — por acaso, e não por hora.
     */
    it('marco entra pelo relógio, e não depois de todas as anotações', async () => {
      render(
        <Linha
          ticket={{
            ...TICKET,
            status: 'AGUARDANDO_FECHAMENTO',
            // Entre a segunda e a terceira anotação.
            done_at: local(2026, 8, 20, 18, 0),
          }}
        />
      );
      await screen.findByText('Conclusão informada');

      // Do mais novo para o mais velho: a terceira, o marco, a segunda.
      expect(posicao(ULTIMA)).toBeLessThan(posicao('Conclusão informada'));
      expect(posicao('Conclusão informada')).toBeLessThan(posicao('Comprei a peça. Chega amanhã.'));
    });

    it('com um registro só não há ordem a escolher', async () => {
      api.get.mockResolvedValue({ data: { updates: [UPDATES[0]] } });
      render(<Linha />);
      await screen.findByText(PRIMEIRA);

      expect(screen.queryByRole('button', { name: /Mostrando/ })).not.toBeInTheDocument();
    });
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

  it('conclusão informada tranca a linha, mesmo para quem escreveria', async () => {
    render(
      <Linha
        podeEscrever
        ticket={{
          ...TICKET,
          status: 'AGUARDANDO_FECHAMENTO',
          done_at: local(2026, 8, 21, 14, 0),
        }}
      />
    );
    await screen.findByText('Conclusão informada');

    // O que o responsável entregou é o que o moderador vai validar: a linha não
    // pode crescer por baixo dele. Quem precisa acrescentar cancela a conclusão.
    expect(screen.queryByText('O que foi feito agora?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apagar/ })).not.toBeInTheDocument();
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

  /**
   * O relato de quem usou: sem sinal nenhum entre o toque e a resposta, a caixa
   * parecia travada e a pessoa tocava em "Apagar" de novo — a segunda vez caindo
   * num registro que já tinha ido.
   */
  it('apagar mostra que está apagando, e o segundo toque não manda outro pedido', async () => {
    const user = userEvent.setup();
    // A resposta fica pendente: é a janela em que a pessoa tocava de novo.
    let concluir;
    api.delete.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));

    render(<Linha podeEscrever />);
    await screen.findByText('Troquei a válvula e testei por 20 minutos.');

    await user.click(screen.getByRole('button', { name: /Apagar/ }));

    const caixa = screen.getByRole('dialog');
    const confirmar = within(caixa).getByRole('button', { name: 'Apagar' });
    await user.click(confirmar);

    expect(api.delete).toHaveBeenCalledTimes(1);
    // O rótulo dá lugar ao giro, e o botão para de aceitar toque.
    expect(confirmar).toBeDisabled();
    expect(within(caixa).getByRole('button', { name: 'Voltar' })).toBeDisabled();

    // `fireEvent` porque o `userEvent` recusaria o clique num botão desativado —
    // e o que se quer provar aqui é justamente que ele não faz nada.
    fireEvent.click(confirmar);
    expect(api.delete).toHaveBeenCalledTimes(1);

    // Deixar a promessa pendente ao fim do teste faria o toast e o refetch
    // caírem fora do act do React, com aviso no console.
    await act(async () => { concluir({ data: { ok: true } }); });
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
