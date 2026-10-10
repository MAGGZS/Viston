import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/responsavel/chamados/t1',
  useParams: () => ({ id: 't1' }),
  useSearchParams: () => new URLSearchParams(),
}));

// Caminho relativo, e não o alias `@/`: o `jest.mock` é içado para antes dos
// imports, e nesse ponto o mapeamento de alias do next/jest ainda não vale.
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
import api from '../lib/api';

import OcorrenciaDoResponsavelPage from '@/app/responsavel/chamados/[id]/page';
import { useAuthStore } from '@/app/store/auth';

const EU = 'u-marcos';

const TICKET = {
  id: 't1',
  status: 'EM_ANDAMENTO',
  maintenance_type: 'ELETRICA',
  category: 'CORRETIVA',
  priority: 'ALTA',
  description: 'Lâmpada do corredor queimada',
  responsible_id: EU,
  floor: { label: '3º andar' },
  received_at: '2026-08-21T10:00:00.000Z',
  report: { id: 'r1', date: '2026-08-20', building: { name: 'Aurora' } },
};

const UPDATE = {
  id: 'up1',
  description: 'Troquei o reator.',
  photos: [],
  author: 'Marcos Lima',
  author_id: EU,
  author_avatar: null,
  created_at: '2026-08-22T10:00:00.000Z',
  edited_at: null,
};

function Tela({ ticket = TICKET, updates = [UPDATE] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  api.get.mockImplementation((url) => {
    if (url === '/tickets/t1') return Promise.resolve({ data: ticket });
    if (url === '/tickets/t1/updates') return Promise.resolve({ data: { updates } });
    return Promise.resolve({ data: {} });
  });
  return render(
    <QueryClientProvider client={client}>
      <OcorrenciaDoResponsavelPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  useAuthStore.setState({
    user: { id: EU, name: 'Marcos', memberships: [{ building_id: 'p1', role: 'RESPONSAVEL' }] },
    isLoading: false,
  });
});

/**
 * "Informar conclusão" não fecha o chamado.
 *
 * O botão se chamava "Concluir serviço", e gente achava que o toque encerrava
 * o chamado. Ele só avisa o moderador, que revisa e fecha. A confirmação diz
 * isso antes do envio, e nada vai ao servidor sem ela.
 */
describe('informar conclusão', () => {
  it('o botão tem o nome do gesto, e não promete fechar', async () => {
    Tela();
    expect(await screen.findByRole('button', { name: /Informar conclusão/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Concluir serviço/ })).not.toBeInTheDocument();
  });

  it('pede confirmação explicando que o moderador revisa e fecha', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(await screen.findByRole('button', { name: /Informar conclusão/ }));

    const caixa = await screen.findByRole('dialog', { name: 'Informar conclusão?' });
    expect(within(caixa).getByText(/Isso não fecha o chamado/)).toBeInTheDocument();
    expect(within(caixa).getByText(/o moderador revisa o serviço e fecha/)).toBeInTheDocument();
    // Até a confirmação, nada foi enviado.
    expect(api.post).not.toHaveBeenCalled();
  });

  // A confirmação abre em portal, fora do container da tela: a varredura é no
  // `document.body`, para pegar a caixa e o que ficou atrás dela.
  it('sem violação de acessibilidade com a confirmação aberta', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(await screen.findByRole('button', { name: /Informar conclusão/ }));
    await screen.findByRole('dialog', { name: 'Informar conclusão?' });

    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('a confirmação não usa o triângulo de perigo: informar não apaga nada', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(await screen.findByRole('button', { name: /Informar conclusão/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Informar conclusão?' });

    const icone = caixa.querySelector('svg[data-tone]');
    expect(icone).toHaveAttribute('data-tone', 'neutral');
    expect(icone).toHaveAttribute('aria-hidden', 'true');
  });

  it('voltar não envia nada', async () => {
    const user = userEvent.setup();
    Tela();

    await user.click(await screen.findByRole('button', { name: /Informar conclusão/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Informar conclusão?' });
    await user.click(within(caixa).getByRole('button', { name: 'Voltar' }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirmar envia a conclusão com o relatório', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: {} });
    Tela();

    await user.type(await screen.findByLabelText(/Relatório do serviço/), 'Reator trocado');
    await user.click(screen.getByRole('button', { name: /Informar conclusão/ }));
    const caixa = await screen.findByRole('dialog', { name: 'Informar conclusão?' });
    await user.click(within(caixa).getByRole('button', { name: 'Informar conclusão' }));

    expect(api.post).toHaveBeenCalledWith('/tickets/t1/done', { done_report: 'Reator trocado' });
  });

  it('sem registro na linha do tempo, o botão apagado aponta para o que falta', async () => {
    Tela({ updates: [] });

    const botao = await screen.findByRole('button', { name: /Informar conclusão/ });
    expect(botao).toBeDisabled();
    const dica = document.getElementById(botao.getAttribute('aria-describedby'));
    expect(dica).toHaveTextContent('Registre ao menos uma atualização acima antes de informar a conclusão.');
  });

  it('depois de informada, a etiqueta diz que espera o moderador fechar', async () => {
    Tela({ ticket: { ...TICKET, status: 'AGUARDANDO_FECHAMENTO', done_at: '2026-08-23T10:00:00.000Z' } });
    expect(await screen.findByText('Aguardando o moderador fechar')).toBeInTheDocument();
  });
});

/**
 * O prazo na tela do chamado, no telefone.
 *
 * Só aparecia no quadro e na caixa do computador. O texto vem do mesmo lugar
 * (`textoDoPrazo`), e o atraso é dito em palavras, não só em vermelho.
 */
describe('prazo na tela do chamado', () => {
  const NO_PRAZO = { dias: 2, limite: 5, restantes: 3, consumo: 0.4, atrasado: false, em_risco: false, congelado: false };
  const ATRASADO = { dias: 7, limite: 5, restantes: 0, consumo: 1.4, atrasado: true, em_risco: false, congelado: false };

  it('mostra quanto falta para o prazo', async () => {
    Tela({ ticket: { ...TICKET, sla: NO_PRAZO } });

    expect(await screen.findByText('Prazo')).toBeInTheDocument();
    const texto = screen.getByText('3 dias úteis para o prazo');
    expect(texto.getAttribute('style')).not.toContain('var(--color-danger)');
  });

  it('atrasado vem escrito e em vermelho, com o triângulo decorativo', async () => {
    Tela({ ticket: { ...TICKET, sla: ATRASADO } });

    const texto = await screen.findByText('Atrasado há 2 dias úteis');
    expect(texto.getAttribute('style')).toContain('var(--color-danger)');
    expect(texto.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
