import { ticketService } from '../services/ticket.service';
import { ticketRepository } from '../repositories/ticket.repository';
import { buildingRepository } from '../repositories/building.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';

jest.mock('../repositories/ticket.repository');
jest.mock('../repositories/building.repository');

const mockTicketRepo = ticketRepository as jest.Mocked<typeof ticketRepository>;
const mockBuildingRepo = buildingRepository as jest.Mocked<typeof buildingRepository>;

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';
const RESPONSIBLE_ID = '33333333-3333-4333-8333-333333333333';

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
