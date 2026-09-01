import { ticketService } from '../services/ticket.service';
import { ticketRepository } from '../repositories/ticket.repository';
import { buildingRepository } from '../repositories/building.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { storageService } from '../services/storage.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';

jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/building.repository');
jest.mock('../repositories/user.repository');
jest.mock('../repositories/manager.repository');
jest.mock('../services/storage.service');

const mockTicketRepo = ticketRepository as jest.Mocked<typeof ticketRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockUserRepo = userRepository as jest.Mocked<typeof userRepository>;
const mockManagerRepo = managerRepository as jest.Mocked<typeof managerRepository>;
const mockStorage = storageService as jest.Mocked<typeof storageService>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';
const RESPONSIBLE_ID = '33333333-3333-4333-8333-333333333333';
const UPDATE_ID = '44444444-4444-4444-8444-444444444444';

/** A ocorrência como o repositório a devolve, com o caminho até o prédio. */
function makeTicket(overrides: any = {}) {
  return {
    id: TICKET_ID,
    maintenance_type: 'ELETRICA',
    category: 'CORRETIVA',
    priority: 'ALTA',
    description: 'Lâmpada queimada no corredor',
    status: 'ABERTO',
    responsible: null,
    responsible_id: null,
    responsible_user: null,
    closed_by: null,
    forwarded_at: null,
    received_at: null,
    done_at: null,
    done_report: null,
    closed_at: null,
    maintenance_note: null,
    maintenance_cost: null,
    created_at: new Date(),
    floor_form_entry: {
      id: 'entry-1',
      status_geral: 'PROBLEMA',
      floor: { id: 'floor-1', label: '6º Andar' },
      report: {
        id: 'report-1',
        date: new Date('2026-08-18'),
        building_id: BUILDING_ID,
        building: { id: BUILDING_ID, name: 'Edifício Principal' },
        inspector: { id: 'user-1', name: 'Carlos', avatar_url: null },
      },
    },
    ...overrides,
  } as any;
}

const moderador = { id: 'user-mod', kind: 'USER', role: 'NONE' } as any;
const responsavel = { id: RESPONSIBLE_ID, kind: 'USER', role: 'NONE' } as any;
const visualizador = { id: 'user-viewer', kind: 'USER', role: 'NONE' } as any;
const gestor = { id: 'gestor-1', kind: 'MANAGER', role: 'NONE' } as any;

/** O papel de quem está pedindo, dentro do prédio do chamado. */
function comPapel(role: string | null) {
  mockBuildingRepo.findMember.mockResolvedValue(role ? ({ id: 'm1', role } as any) : null);
  mockBuildingRepo.findManagerLink.mockResolvedValue(null);
}

/** Uma anotação da linha do tempo, como o repositório a devolve. */
function makeUpdate(overrides: any = {}) {
  return {
    id: UPDATE_ID,
    ticket_id: TICKET_ID,
    author_id: RESPONSIBLE_ID,
    author_name: 'Marina',
    description: 'Abri o forro e achei a válvula travada',
    photos: [],
    created_at: new Date('2026-08-20T12:00:00Z'),
    edited_at: null,
    author: { id: RESPONSIBLE_ID, name: 'Marina', avatar_url: null },
    ...overrides,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTicketRepo.findById.mockResolvedValue(makeTicket());
  mockTicketRepo.update.mockImplementation(((_id: string, data: any) =>
    Promise.resolve(makeTicket(data))) as any);
  mockBuildingRepo.findResponsible.mockResolvedValue({
    id: RESPONSIBLE_ID,
    name: 'Marina',
    email: 'marina@test.com',
    avatar_url: null,
  } as any);

  // O chamado tem andamento registrado por padrão: é o estado normal de quem
  // chega ao ponto de concluir, e os testes que cobrem a exigência zeram isto.
  mockTicketRepo.countUpdates.mockResolvedValue(1);
  mockTicketRepo.listUpdates.mockResolvedValue([makeUpdate()]);
  mockTicketRepo.lastUpdate.mockResolvedValue(makeUpdate());
  mockTicketRepo.createUpdate.mockImplementation(((data: any) =>
    Promise.resolve(makeUpdate(data))) as any);
  mockTicketRepo.editUpdate.mockImplementation(((id: string, description: string) =>
    Promise.resolve(makeUpdate({ id, description, edited_at: new Date() }))) as any);
  mockTicketRepo.removeUpdate.mockResolvedValue(makeUpdate());

  mockUserRepo.findById.mockResolvedValue({ id: RESPONSIBLE_ID, name: 'Marina' } as any);
  mockManagerRepo.findById.mockResolvedValue({ id: 'gestor-1', name: 'Dona Célia' } as any);
  mockStorage.uploadTicketPhoto.mockResolvedValue('https://bucket/ticket_foto.jpg');
  mockStorage.removeTicketPhoto.mockResolvedValue(undefined);
});

// ── Encaminhar ────────────────────────────────────────────────────────────────
describe('ticketService.forward', () => {
  it('tira o chamado da fila de novos e o deixa aguardando o aceite', async () => {
    comPapel('MODERADOR');

    await ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    // Encaminhar não é começar: quem começa é o responsável, ao receber
    expect(patch.status).toBe('ENCAMINHADO');
    expect(patch.status).not.toBe('EM_ANDAMENTO');
    expect(patch.responsible_id).toBe(RESPONSIBLE_ID);
    // O nome vai junto: é o que o relatório antigo mostra se a conta sumir
    expect(patch.responsible).toBe('Marina');
    expect(patch.forwarded_at).toBeInstanceOf(Date);
    expect(patch.received_at).toBeNull();
  });

  it('recusa quem não trata os chamados daquele prédio', async () => {
    comPapel('INSPECTOR');

    await expect(ticketService.forward(TICKET_ID, visualizador, RESPONSIBLE_ID)).rejects.toThrow(
      ForbiddenError
    );
  });

  it('recusa encaminhar a quem não é responsável naquele prédio', async () => {
    comPapel('MODERADOR');
    mockBuildingRepo.findResponsible.mockResolvedValue(null);

    await expect(ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID)).rejects.toThrow(
      ConflictError
    );
  });

  it('deixa o gestor do prédio encaminhar', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);
    mockBuildingRepo.findManagerLink.mockResolvedValue({ id: 'bm1' } as any);

    await ticketService.forward(TICKET_ID, gestor, RESPONSIBLE_ID);
    expect(mockTicketRepo.update).toHaveBeenCalledTimes(1);
  });

  it('reabre o trabalho ao trocar de responsável: o "terminei" anterior não vale', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'AGUARDANDO_FECHAMENTO', done_at: new Date() })
    );

    await ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('ENCAMINHADO');
    expect(patch.done_at).toBeNull();
  });

  it('reencaminhar limpa o recebimento: quem chega agora ainda não pegou o chamado', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({
        status: 'EM_ANDAMENTO',
        responsible_id: 'outra-pessoa',
        forwarded_at: new Date('2026-08-10'),
        received_at: new Date('2026-08-11'),
      })
    );

    await ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('ENCAMINHADO');
    expect(patch.received_at).toBeNull();
    // A data de encaminhamento é a da última decisão, não a da primeira
    expect(patch.forwarded_at).toBeInstanceOf(Date);
  });

  it('não mexe em chamado já fechado', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'CONCLUIDO' }));

    await expect(ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID)).rejects.toThrow(
      ConflictError
    );
  });

  it('404 quando o chamado não existe', async () => {
    mockTicketRepo.findById.mockResolvedValue(null);
    await expect(ticketService.forward(TICKET_ID, moderador, RESPONSIBLE_ID)).rejects.toThrow(
      NotFoundError
    );
  });
});

// ── O responsável recebe o chamado ────────────────────────────────────────────
describe('ticketService.receive', () => {
  it('põe o chamado em andamento e carimba o recebimento', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID, forwarded_at: new Date() })
    );

    await ticketService.receive(TICKET_ID, responsavel);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('EM_ANDAMENTO');
    expect(patch.received_at).toBeInstanceOf(Date);
  });

  it('recusa quem não é o responsável do chamado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: 'outra-pessoa' })
    );

    await expect(ticketService.receive(TICKET_ID, responsavel)).rejects.toThrow(ForbiddenError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('nem o moderador recebe no lugar da pessoa — o aceite é dela', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.receive(TICKET_ID, moderador)).rejects.toThrow(ForbiddenError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('recusa receber o que ainda não foi encaminhado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ABERTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.receive(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
  });

  it('não recebe duas vezes', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, received_at: new Date() })
    );

    await expect(ticketService.receive(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('não recebe chamado já fechado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'CONCLUIDO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.receive(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
  });
});

// ── O responsável informa que terminou ────────────────────────────────────────
describe('ticketService.reportDone', () => {
  it('deixa o chamado aguardando fechamento — não o conclui', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await ticketService.reportDone(TICKET_ID, responsavel);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('AGUARDANDO_FECHAMENTO');
    expect(patch.status).not.toBe('CONCLUIDO');
    expect(patch.done_at).toBeInstanceOf(Date);
  });

  it('grava o relatório do serviço junto da conclusão', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, received_at: new Date() })
    );

    await ticketService.reportDone(TICKET_ID, responsavel, 'Trocado o reator e testado');

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.done_report).toBe('Trocado o reator e testado');
    expect(patch.status).toBe('AGUARDANDO_FECHAMENTO');
  });

  it('concluir sem escrever nada não mexe no relatório', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, received_at: new Date() })
    );

    await ticketService.reportDone(TICKET_ID, responsavel);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch).not.toHaveProperty('done_report');
  });

  it('texto em branco apaga o relatório', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, done_report: 'antigo' })
    );

    await ticketService.reportDone(TICKET_ID, responsavel, '');

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.done_report).toBeNull();
  });

  it('recusa o responsável de outro chamado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: 'outra-pessoa' })
    );

    await expect(ticketService.reportDone(TICKET_ID, responsavel)).rejects.toThrow(ForbiddenError);
  });

  it('recusa chamado que ainda não foi encaminhado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ABERTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.reportDone(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
  });

  it('não se conclui o que não foi recebido', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID, forwarded_at: new Date() })
    );

    await expect(ticketService.reportDone(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('recusa concluir sem nenhum passo registrado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, received_at: new Date() })
    );
    mockTicketRepo.countUpdates.mockResolvedValue(0);

    // Sem isto, um chamado ia de "recebido" a "concluído" sem que uma linha do
    // sistema dissesse o que aconteceu no meio.
    await expect(ticketService.reportDone(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });
});

// ── Desfazer a conclusão ──────────────────────────────────────────────────────
describe('ticketService.undoDone', () => {
  it('devolve o chamado ao andamento e apaga a data da conclusão', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({
        status: 'AGUARDANDO_FECHAMENTO',
        responsible_id: RESPONSIBLE_ID,
        done_at: new Date(),
        done_report: 'Trocado o reator',
      })
    );

    await ticketService.undoDone(TICKET_ID, responsavel);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('EM_ANDAMENTO');
    expect(patch.done_at).toBeNull();
    // O texto fica: quem cancelou vai concluir de novo, e reescrever do zero
    // seria cobrar duas vezes o mesmo relato.
    expect(patch).not.toHaveProperty('done_report');
  });

  it('deixa o moderador desfazer também', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'AGUARDANDO_FECHAMENTO', responsible_id: RESPONSIBLE_ID, done_at: new Date() })
    );

    await ticketService.undoDone(TICKET_ID, moderador);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('EM_ANDAMENTO');
  });

  it('recusa o chamado que ainda nem foi concluído', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.undoDone(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('recusa o chamado que o moderador já fechou — desfazer ali seria reabrir', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'CONCLUIDO', responsible_id: RESPONSIBLE_ID, closed_at: new Date() })
    );

    await expect(ticketService.undoDone(TICKET_ID, responsavel)).rejects.toThrow(ConflictError);
  });

  it('recusa o responsável de outro chamado', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'AGUARDANDO_FECHAMENTO', responsible_id: 'outra-pessoa', done_at: new Date() })
    );

    await expect(ticketService.undoDone(TICKET_ID, responsavel)).rejects.toThrow(ForbiddenError);
  });

  it('a linha do tempo volta a aceitar depois de desfeita a conclusão', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, done_report: 'Trocado o reator' })
    );

    await ticketService.addUpdate(TICKET_ID, responsavel, { description: 'A peça chegou', photos: [] });

    expect(mockTicketRepo.createUpdate).toHaveBeenCalled();
  });
});

// ── A linha do tempo da manutenção ────────────────────────────────────────────
describe('ticketService.addUpdate', () => {
  const passo = { description: 'Troquei a válvula', photos: [] };

  it('grava o passo com o nome de quem escreveu congelado na linha', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await ticketService.addUpdate(TICKET_ID, responsavel, passo);

    const [data] = mockTicketRepo.createUpdate.mock.calls[0];
    expect(data.ticket_id).toBe(TICKET_ID);
    expect(data.author_id).toBe(RESPONSIBLE_ID);
    // O nome vai junto: é o que sobra quando a conta sai do sistema.
    expect(data.author_name).toBe('Marina');
    expect(data.description).toBe('Troquei a válvula');
  });

  it('deixa o moderador do prédio registrar', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await ticketService.addUpdate(TICKET_ID, moderador, passo);

    expect(mockTicketRepo.createUpdate).toHaveBeenCalled();
  });

  it('recusa o gestor — ele lê a linha, não escreve nela', async () => {
    comPapel(null);
    mockBuildingRepo.findManagerLink.mockResolvedValue({ id: 'bm1' } as any);
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.addUpdate(TICKET_ID, gestor, passo)).rejects.toThrow(ForbiddenError);
    expect(mockTicketRepo.createUpdate).not.toHaveBeenCalled();
  });

  it('recusa o chamado que ainda não foi recebido', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID, forwarded_at: new Date() })
    );

    await expect(ticketService.addUpdate(TICKET_ID, responsavel, passo)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.createUpdate).not.toHaveBeenCalled();
  });

  it('recusa o chamado já fechado — a linha vira arquivo', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'CONCLUIDO', responsible_id: RESPONSIBLE_ID, closed_at: new Date() })
    );

    await expect(ticketService.addUpdate(TICKET_ID, responsavel, passo)).rejects.toThrow(ConflictError);
  });

  it('recusa depois da conclusão informada — a entrega nao cresce sozinha', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({
        status: 'AGUARDANDO_FECHAMENTO',
        responsible_id: RESPONSIBLE_ID,
        done_at: new Date(),
      })
    );

    // O que o responsável entregou é o que o moderador vai validar. Quem
    // precisa acrescentar cancela a conclusão primeiro.
    await expect(ticketService.addUpdate(TICKET_ID, responsavel, passo)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.createUpdate).not.toHaveBeenCalled();
  });

  it('recusa o moderador depois da conclusão informada, como recusa o responsável', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({
        status: 'AGUARDANDO_FECHAMENTO',
        responsible_id: RESPONSIBLE_ID,
        done_at: new Date(),
      })
    );

    await expect(ticketService.addUpdate(TICKET_ID, moderador, passo)).rejects.toThrow(ConflictError);
  });

  it('sobe as fotos antes de gravar a linha e guarda as URLs', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    // JPEG mínimo: os três bytes de assinatura, que é o que o servidor confere.
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`;

    await ticketService.addUpdate(TICKET_ID, responsavel, { description: 'Com foto', photos: [jpeg] });

    expect(mockStorage.uploadTicketPhoto).toHaveBeenCalledTimes(1);
    const [data] = mockTicketRepo.createUpdate.mock.calls[0];
    expect(data.photos).toEqual(['https://bucket/ticket_foto.jpg']);
  });

  it('recusa a foto cujo rótulo não bate com os bytes', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    // Diz ser PNG e é JPEG: sem a conferência dos bytes, o content-type do
    // objeto no bucket viria de quem enviou.
    const mentira = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`;

    await expect(
      ticketService.addUpdate(TICKET_ID, responsavel, { description: 'Falsa', photos: [mentira] })
    ).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.createUpdate).not.toHaveBeenCalled();
  });
});

describe('ticketService.editUpdate e removeUpdate', () => {
  beforeEach(() => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );
  });

  it('corrige o texto da última e marca que foi editada', async () => {
    await ticketService.editUpdate(TICKET_ID, UPDATE_ID, responsavel, 'Texto corrigido');

    const [id, description] = mockTicketRepo.editUpdate.mock.calls[0];
    expect(id).toBe(UPDATE_ID);
    expect(description).toBe('Texto corrigido');
  });

  it('recusa alterar o que já tem outra linha embaixo', async () => {
    mockTicketRepo.lastUpdate.mockResolvedValue(makeUpdate({ id: 'outra-mais-nova' }));

    await expect(
      ticketService.editUpdate(TICKET_ID, UPDATE_ID, responsavel, 'Texto corrigido')
    ).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.editUpdate).not.toHaveBeenCalled();
  });

  it('recusa alterar a linha escrita por outra pessoa', async () => {
    mockTicketRepo.lastUpdate.mockResolvedValue(makeUpdate({ author_id: 'user-mod' }));

    await expect(
      ticketService.editUpdate(TICKET_ID, UPDATE_ID, responsavel, 'Texto corrigido')
    ).rejects.toThrow(ForbiddenError);
  });

  it('apagar leva as fotos junto', async () => {
    mockTicketRepo.lastUpdate.mockResolvedValue(
      makeUpdate({ photos: ['https://bucket/ticket_a.jpg', 'https://bucket/ticket_b.jpg'] })
    );

    await ticketService.removeUpdate(TICKET_ID, UPDATE_ID, responsavel);

    expect(mockTicketRepo.removeUpdate).toHaveBeenCalledWith(UPDATE_ID);
    expect(mockStorage.removeTicketPhoto).toHaveBeenCalledTimes(2);
  });

  it('sem nenhuma linha, não há o que alterar', async () => {
    mockTicketRepo.lastUpdate.mockResolvedValue(null);

    await expect(
      ticketService.removeUpdate(TICKET_ID, UPDATE_ID, responsavel)
    ).rejects.toThrow(NotFoundError);
  });
});

describe('ticketService.listUpdates', () => {
  it('devolve a linha do tempo a quem tem vínculo com o prédio', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    const { updates } = await ticketService.listUpdates(TICKET_ID, moderador);

    expect(updates).toHaveLength(1);
    // O nome que sai é o congelado, e não o da conta ligada.
    expect(updates[0].author).toBe('Marina');
  });

  it('devolve vazio no chamado que ainda não tem o que contar', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'ENCAMINHADO', responsible_id: RESPONSIBLE_ID })
    );

    const { updates } = await ticketService.listUpdates(TICKET_ID, moderador);

    expect(updates).toEqual([]);
    expect(mockTicketRepo.listUpdates).not.toHaveBeenCalled();
  });

  it('recusa quem não tem nada a ver com o prédio', async () => {
    // Ator próprio, e não `visualizador`: o vínculo é cacheado por objeto (ver
    // `getBuildingStanding`), e o dele já foi resolvido como INSPECTOR num
    // teste acima — inspetor é membro, e membro lê.
    const estranho = { id: 'user-de-fora', kind: 'USER', role: 'NONE' } as any;
    comPapel(null);
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.listUpdates(TICKET_ID, estranho)).rejects.toThrow(ForbiddenError);
  });
});

// ── Fechar: a regra central ───────────────────────────────────────────────────
describe('ticketService.close', () => {
  it('só o moderador fecha — o responsável não', async () => {
    comPapel('RESPONSAVEL');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'AGUARDANDO_FECHAMENTO', responsible_id: RESPONSIBLE_ID })
    );

    await expect(ticketService.close(TICKET_ID, responsavel)).rejects.toThrow(ForbiddenError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('fecha e assina quem fechou', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'AGUARDANDO_FECHAMENTO' }));

    await ticketService.close(TICKET_ID, moderador);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('CONCLUIDO');
    expect(patch.closed_at).toBeInstanceOf(Date);
    expect(patch.closed_by_id).toBe('user-mod');
  });

  it('quando quem fecha é o gestor, a assinatura fica nula — ele não está em users', async () => {
    mockBuildingRepo.findMember.mockResolvedValue(null);
    mockBuildingRepo.findManagerLink.mockResolvedValue({ id: 'bm1' } as any);
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'EM_ANDAMENTO' }));

    await ticketService.close(TICKET_ID, gestor);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('CONCLUIDO');
    expect(patch.closed_by_id).toBeNull();
  });

  it('não fecha duas vezes', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'CONCLUIDO' }));

    await expect(ticketService.close(TICKET_ID, moderador)).rejects.toThrow(ConflictError);
  });

  it('recusa quem só acompanha o prédio', async () => {
    comPapel('VIEWER');
    await expect(ticketService.close(TICKET_ID, visualizador)).rejects.toThrow(ForbiddenError);
  });
});

// ── Manutenção e valor ────────────────────────────────────────────────────────
describe('ticketService.update', () => {
  it('grava a manutenção necessária e o valor', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'EM_ANDAMENTO' }));

    await ticketService.update(TICKET_ID, moderador, {
      maintenance_note: 'Trocar o reator',
      maintenance_cost: 320.5,
    });

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.maintenance_note).toBe('Trocar o reator');
    // Dinheiro vira Decimal antes de chegar ao banco
    expect(String(patch.maintenance_cost)).toBe('320.5');
  });

  it('apaga o valor quando ele vem nulo', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'EM_ANDAMENTO' }));

    await ticketService.update(TICKET_ID, moderador, { maintenance_cost: null });

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.maintenance_cost).toBeNull();
  });

  it('recusa quem não trata os chamados do prédio', async () => {
    comPapel('RESPONSAVEL');
    await expect(
      ticketService.update(TICKET_ID, responsavel, { maintenance_cost: 10 })
    ).rejects.toThrow(ForbiddenError);
  });
});

// ── Contadores do painel ──────────────────────────────────────────────────────
describe('ticketService.stats', () => {
  it('soma em "em andamento" tudo que ainda não fechou, e conta o encaminhado à parte', async () => {
    mockTicketRepo.countByStatus.mockResolvedValue({
      ABERTO: 4,
      ENCAMINHADO: 5,
      EM_ANDAMENTO: 3,
      AGUARDANDO_TERCEIRO: 1,
      AGUARDANDO_FECHAMENTO: 2,
      CONCLUIDO: 7,
    } as any);

    const stats = await ticketService.stats(BUILDING_ID);

    expect(stats).toEqual({
      abertos: 4,
      encaminhados: 5,
      em_andamento: 6,
      aguardando_fechamento: 2,
      concluidos: 7,
    });
    // O que ninguém aceitou não conta como trabalho em curso
    expect(stats.em_andamento).not.toBe(11);
  });
});

// ── O resumo dos gráficos do painel ───────────────────────────────────────────
describe('ticketService.summary', () => {
  const contagens = {
    status: {
      ABERTO: 4,
      ENCAMINHADO: 5,
      EM_ANDAMENTO: 3,
      AGUARDANDO_TERCEIRO: 1,
      AGUARDANDO_FECHAMENTO: 2,
      CONCLUIDO: 7,
    },
    category: { PREVENTIVA: 8, CORRETIVA: 9, EMERGENCIAL: 3, EVENTOS: 1, PROJETOS: 1 },
  };

  beforeEach(() => {
    mockTicketRepo.countByStatusAndCategory.mockResolvedValue(contagens as any);
  });

  it('devolve as contagens cruas, sem agrupar o que a tela agrupa', async () => {
    // A pizza junta EM_ANDAMENTO com AGUARDANDO_TERCEIRO, e os contadores do
    // topo juntam ainda o AGUARDANDO_FECHAMENTO. Se o servidor entregasse
    // somado, cada leitura dessas viraria um campo próprio aqui.
    const resumo = await ticketService.summary(BUILDING_ID, {});

    expect(resumo.by_status).toEqual(contagens.status);
    expect(resumo.by_category).toEqual(contagens.category);
  });

  it('o total é a soma dos estados, e não a das categorias', async () => {
    // As duas somas dão o mesmo número — são os mesmos registros contados por
    // colunas diferentes. O total sai daqui para a pizza virar porcentagem
    // sobre um número só; somar no cliente daria dois totais se um dia alguma
    // fatia ficasse de fora do desenho.
    const resumo = await ticketService.summary(BUILDING_ID, {});

    expect(resumo.total).toBe(22);
  });

  it('o período chega inteiro ao banco, e não peneira depois', async () => {
    const date_from = new Date('2026-01-01');
    const date_to = new Date('2026-08-29');

    await ticketService.summary(BUILDING_ID, { date_from, date_to });

    expect(mockTicketRepo.countByStatusAndCategory).toHaveBeenCalledWith(BUILDING_ID, {
      date_from,
      date_to,
    });
  });

  it('sem período, o resumo é o prédio inteiro desde sempre', async () => {
    await ticketService.summary(BUILDING_ID, {});

    expect(mockTicketRepo.countByStatusAndCategory).toHaveBeenCalledWith(BUILDING_ID, {});
  });
});

// ── Cancelar o envio ──────────────────────────────────────────────────────────
describe('ticketService.unforward', () => {
  it('devolve o chamado à fila de novos, sem dono e sem carimbos', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({
        status: 'ENCAMINHADO',
        responsible_id: RESPONSIBLE_ID,
        responsible: 'Marina',
        forwarded_at: new Date(),
      })
    );

    await ticketService.unforward(TICKET_ID, moderador);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('ABERTO');
    expect(patch.responsible_id).toBeNull();
    expect(patch.responsible).toBeNull();
    // Sem limpar a data, o chamado voltaria para "novos" dizendo que foi enviado
    expect(patch.forwarded_at).toBeNull();
  });

  it('recusa depois que o responsável já recebeu — aí o caminho é reencaminhar', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(
      makeTicket({ status: 'EM_ANDAMENTO', responsible_id: RESPONSIBLE_ID, received_at: new Date() })
    );

    await expect(ticketService.unforward(TICKET_ID, moderador)).rejects.toThrow(ConflictError);
    expect(mockTicketRepo.update).not.toHaveBeenCalled();
  });

  it('recusa em chamado que nunca foi encaminhado', async () => {
    comPapel('MODERADOR');

    await expect(ticketService.unforward(TICKET_ID, moderador)).rejects.toThrow(ConflictError);
  });

  it('recusa quem não modera o prédio', async () => {
    comPapel('INSPECTOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'ENCAMINHADO' }));

    await expect(ticketService.unforward(TICKET_ID, visualizador)).rejects.toThrow(ForbiddenError);
  });
});

// ── Finalizar com relatório ───────────────────────────────────────────────────
describe('ticketService.close', () => {
  it('grava o relatório e o gasto do moderador junto do fechamento', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'AGUARDANDO_FECHAMENTO' }));

    await ticketService.close(TICKET_ID, moderador, {
      maintenance_note: 'Trocado o disjuntor do ramal',
      maintenance_cost: 1200.5,
    });

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('CONCLUIDO');
    expect(patch.closed_at).toBeInstanceOf(Date);
    expect(patch.maintenance_note).toBe('Trocado o disjuntor do ramal');
    // DECIMAL, não ponto flutuante: dinheiro não some no arredondamento
    expect(String(patch.maintenance_cost)).toBe('1200.5');
  });

  it('fecha sem relatório nenhum — o app antigo manda o corpo vazio', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'AGUARDANDO_FECHAMENTO' }));

    await ticketService.close(TICKET_ID, moderador);

    const [, patch] = mockTicketRepo.update.mock.calls[0];
    expect(patch.status).toBe('CONCLUIDO');
    // Não mandar o campo é diferente de mandá-lo nulo: sem isso, fechar
    // apagaria a nota que já estava lá
    expect('maintenance_note' in patch).toBe(false);
    expect('maintenance_cost' in patch).toBe(false);
  });

  it('não fecha duas vezes', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findById.mockResolvedValue(makeTicket({ status: 'CONCLUIDO' }));

    await expect(ticketService.close(TICKET_ID, moderador)).rejects.toThrow(ConflictError);
  });
});

// ── Relatório do período ──────────────────────────────────────────────────────
describe('ticketService.reportPeriod', () => {
  beforeEach(() => {
    mockBuildingRepo.findById.mockResolvedValue({ id: BUILDING_ID, name: 'Edifício Principal' } as any);
    mockTicketRepo.findClosedBetween.mockResolvedValue([]);
  });

  it('recorta o período pelo calendário local, não pelo relógio UTC', async () => {
    comPapel('MODERADOR');

    await ticketService.reportPeriod(BUILDING_ID, moderador, '2026-08-01', '2026-08-31');

    const [, from, to] = mockTicketRepo.findClosedBetween.mock.calls[0];
    // Meia-noite de 1º de agosto em São Paulo = 03:00 UTC do mesmo dia
    expect((from as Date).toISOString()).toBe('2026-08-01T03:00:00.000Z');
    // O fim é o último instante de 31/08 local, já em 1º de setembro UTC —
    // sem isso, a manutenção fechada às 22h do dia 31 ficava fora do relatório
    expect((to as Date).toISOString()).toBe('2026-09-01T02:59:59.999Z');
  });

  it('soma o gasto das manutenções finalizadas, ignorando as sem custo', async () => {
    comPapel('MODERADOR');
    mockTicketRepo.findClosedBetween.mockResolvedValue([
      makeTicket({ status: 'CONCLUIDO', maintenance_cost: 1200 }),
      makeTicket({ status: 'CONCLUIDO', maintenance_cost: null }),
      makeTicket({ status: 'CONCLUIDO', maintenance_cost: 650.5 }),
    ] as any);

    const data = await ticketService.reportPeriod(BUILDING_ID, moderador, '2026-08-01', '2026-08-31');

    expect(data.tickets).toHaveLength(3);
    // Sem custo é ausência de despesa, não zero somado
    expect(data.total_cost).toBe(1850.5);
    expect(data.building.name).toBe('Edifício Principal');
  });

  it('recusa quem não modera o prédio', async () => {
    comPapel('INSPECTOR');

    await expect(
      ticketService.reportPeriod(BUILDING_ID, visualizador, '2026-08-01', '2026-08-31')
    ).rejects.toThrow(ForbiddenError);
  });
});

/**
 * O afunilamento da listagem.
 *
 * Os filtros nasceram com a tela ampliada do histórico de ocorrências, e o que
 * eles não podem é furar o recorte da tela que os usa: o `group` continua
 * mandando em quais estados a lista alcança, e o `status` pedido só escolhe
 * dentro dele.
 */
describe('ticketService.listByBuilding', () => {
  beforeEach(() => {
    mockTicketRepo.findByBuilding.mockResolvedValue([[], 0] as any);
  });

  /** Os filtros como o schema os entrega, com os defaults já aplicados. */
  function filtros(extra: any = {}) {
    return { group: 'TODOS', page: 1, limit: 30, ...extra } as any;
  }

  it('leva andar, data, tipo, categoria, prioridade, responsável e busca ao repositório', async () => {
    const date_from = new Date('2026-08-01');
    const date_to = new Date('2026-08-31');

    await ticketService.listByBuilding(
      BUILDING_ID,
      filtros({
        floor_id: 'floor-1',
        maintenance_type: 'ELETRICA',
        category: 'CORRETIVA',
        priority: 'ALTA',
        responsible_id: RESPONSIBLE_ID,
        date_from,
        date_to,
        q: 'lâmpada',
      })
    );

    expect(mockTicketRepo.findByBuilding).toHaveBeenCalledWith(
      expect.objectContaining({
        building_id: BUILDING_ID,
        floor_id: 'floor-1',
        maintenance_type: 'ELETRICA',
        category: 'CORRETIVA',
        priority: 'ALTA',
        responsible_id: RESPONSIBLE_ID,
        date_from,
        date_to,
        q: 'lâmpada',
      })
    );
  });

  it('sem status pedido, a lista é a do grupo inteiro', async () => {
    await ticketService.listByBuilding(BUILDING_ID, filtros({ group: 'ANDAMENTO' }));

    const { statuses } = mockTicketRepo.findByBuilding.mock.calls[0][0];
    expect(statuses).toEqual(['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO', 'AGUARDANDO_FECHAMENTO']);
  });

  it('o status pedido afunila o grupo em vez de somar-se a ele', async () => {
    await ticketService.listByBuilding(
      BUILDING_ID,
      filtros({ group: 'ANDAMENTO', status: 'AGUARDANDO_TERCEIRO' })
    );

    const { statuses } = mockTicketRepo.findByBuilding.mock.calls[0][0];
    expect(statuses).toEqual(['AGUARDANDO_TERCEIRO']);
  });

  it('status fora do grupo devolve lista vazia, e não fura o recorte da tela', async () => {
    // "Concluídos entre os novos" não existe: pedir isso na fila de novos tem
    // de devolver nada, nunca o chamado fechado aparecendo onde não é dele.
    const resultado = await ticketService.listByBuilding(
      BUILDING_ID,
      filtros({ group: 'NOVOS', status: 'CONCLUIDO' })
    );

    const { statuses } = mockTicketRepo.findByBuilding.mock.calls[0][0];
    expect(statuses).toEqual([]);
    expect(resultado.tickets).toEqual([]);
  });
});

// ── A ordem da lista ──────────────────────────────────────────────────────────
describe('ticketService.listByBuilding — ordem', () => {
  beforeEach(() => {
    mockTicketRepo.findByBuilding.mockResolvedValue([[], 0] as any);
  });

  function filtros(extra: any = {}) {
    return { group: 'TODOS', page: 1, limit: 30, ...extra } as any;
  }

  /** A ordem escolhida na chamada ao repositório. */
  const ordemPedida = () => mockTicketRepo.findByBuilding.mock.calls[0][0].sort;

  it('os finalizados abrem pelo que fechou por último, sem a tela pedir', async () => {
    // A coluna que a pessoa lê ali é "Fechado em". Ordenar por criação punha um
    // chamado aberto em março e fechado ontem no fim da lista.
    await ticketService.listByBuilding(BUILDING_ID, filtros({ group: 'CONCLUIDOS' }));

    expect(ordemPedida()).toBe('CLOSED_DESC');
  });

  it('as demais filas seguem pela criação — nelas nada fechou ainda', async () => {
    await ticketService.listByBuilding(BUILDING_ID, filtros({ group: 'NOVOS' }));

    expect(ordemPedida()).toBeUndefined();
  });

  it('a ordem pedida pela tela vence o padrão do grupo', async () => {
    await ticketService.listByBuilding(
      BUILDING_ID,
      filtros({ group: 'CONCLUIDOS', sort: 'CLOSED_ASC' })
    );

    expect(ordemPedida()).toBe('CLOSED_ASC');
  });
});
