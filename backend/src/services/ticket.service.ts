import { AuditAction, Prisma, RecordStatus } from '@prisma/client';
import { ticketRepository, TicketRow } from '../repositories/ticket.repository';
import { buildingRepository, auditRepository, actorAudit } from '../repositories/building.repository';
import { Actor } from '../middlewares/authenticate';
import { canModerateBuilding } from '../middlewares/buildingAccess';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { TICKET_GROUPS, TicketGroup } from '../validators/ticket.validator';

/**
 * O chamado como as telas o leem.
 *
 * A resposta é plana de propósito: a tela do moderador mostra andar, data e
 * inspetor ao lado da descrição, e obrigá-la a descer três níveis de `include`
 * para achar cada um deles espalharia a forma do banco pelo JSX.
 *
 * `maintenance_cost` sai como número: é DECIMAL no banco, e o Prisma o entrega
 * como objeto — que vira string no JSON e chega ao front como "1200.00".
 */
export function toTicket(row: TicketRow) {
  const entry = row.floor_form_entry;
  const report = entry.report;

  return {
    id: row.id,
    maintenance_type: row.maintenance_type,
    category: row.category,
    priority: row.priority,
    description: row.description,
    status: row.status,
    responsible: row.responsible_user?.name ?? row.responsible ?? null,
    responsible_id: row.responsible_id,
    responsible_user: row.responsible_user,
    forwarded_at: row.forwarded_at,
    done_at: row.done_at,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    maintenance_note: row.maintenance_note,
    maintenance_cost: row.maintenance_cost === null ? null : Number(row.maintenance_cost),
    created_at: row.created_at,
    floor: entry.floor,
    floor_status: entry.status_geral,
    report: {
      id: report.id,
      // Só o dia: o relatório inteiro passou a ser do dia, e a hora do envio não
      // diz nada sobre o chamado.
      date: report.date,
      building: report.building,
      inspector: report.inspector,
    },
  };
}

/** Carrega o chamado e o prédio a que ele pertence, ou 404. */
async function loadTicket(id: string) {
  const ticket = await ticketRepository.findById(id);
  if (!ticket) throw new NotFoundError('Chamado');
  return { ticket, buildingId: ticket.floor_form_entry.report.building_id };
}

/** Recusa quem não trata os chamados daquele prédio. */
async function assertModerator(user: Actor, buildingId: string) {
  if (!(await canModerateBuilding(user, buildingId))) {
    throw new ForbiddenError('Apenas o moderador do prédio pode fazer isso');
  }
}

/**
 * O responsável precisa existir, ser conta de usuário e ter o papel naquele
 * prédio. Sem esta checagem, encaminhar aceitaria qualquer id — inclusive o de
 * alguém que só acompanha, ou de outro prédio.
 */
async function assertResponsibleOfBuilding(buildingId: string, responsibleId: string) {
  const responsible = await buildingRepository.findResponsible(buildingId, responsibleId);
  if (!responsible) throw new ConflictError('Esta pessoa não é responsável neste prédio');
  return responsible;
}

async function logTicket(user: Actor, buildingId: string, ticketId: string, metadata: Record<string, unknown>) {
  await auditRepository.log({
    ...actorAudit(user),
    building_id: buildingId,
    action: AuditAction.UPDATE,
    entity: 'MaintenanceRecord',
    entity_id: ticketId,
    metadata,
  });
}

export const ticketService = {
  /** A fila do moderador, num dos três estados da barra lateral. */
  async listByBuilding(
    buildingId: string,
    filters: { group: TicketGroup; page: number; limit: number }
  ) {
    const statuses = [...TICKET_GROUPS[filters.group]] as RecordStatus[];
    const [rows, total] = await ticketRepository.findByBuilding({
      building_id: buildingId,
      statuses,
      page: filters.page,
      limit: filters.limit,
    });

    return {
      tickets: rows.map(toTicket),
      total,
      page: filters.page,
      limit: filters.limit,
      pages: Math.ceil(total / filters.limit),
    };
  },

  /**
   * Os contadores do painel: aberto, em andamento e concluído.
   *
   * "Em andamento" soma os três estados intermediários pelo mesmo motivo da
   * listagem — chamado que o responsável disse ter terminado ainda não fechou.
   */
  async stats(buildingId: string) {
    const counts = await ticketRepository.countByStatus(buildingId);
    return {
      abertos: counts.ABERTO,
      em_andamento:
        counts.EM_ANDAMENTO + counts.AGUARDANDO_TERCEIRO + counts.AGUARDANDO_FECHAMENTO,
      aguardando_fechamento: counts.AGUARDANDO_FECHAMENTO,
      concluidos: counts.CONCLUIDO,
    };
  },

  /** O que foi encaminhado a esta pessoa, em todos os prédios dela. */
  async listMine(user: Actor, includeClosed = false) {
    if (user.kind !== 'USER') return { tickets: [] };
    const rows = await ticketRepository.findByResponsible(user.id, includeClosed);
    return { tickets: rows.map(toTicket) };
  },

  /**
   * Encaminha o chamado ao responsável — o gesto que tira a ocorrência da fila
   * de novos e a põe em andamento.
   *
   * Vale também para trocar de responsável com o chamado já correndo: o
   * moderador redireciona, e a data de encaminhamento é a da última decisão.
   * Chamado fechado não volta a andar por aqui.
   */
  async forward(id: string, user: Actor, responsibleId: string) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertModerator(user, buildingId);

    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    const responsible = await assertResponsibleOfBuilding(buildingId, responsibleId);

    const updated = await ticketRepository.update(id, {
      responsible_id: responsibleId,
      // O nome também é gravado: é o que o relatório mostra quando a conta some.
      responsible: responsible.name,
      status: RecordStatus.EM_ANDAMENTO,
      forwarded_at: new Date(),
      // Encaminhar de novo reabre o trabalho: o "terminei" anterior era do
      // responsável antigo e não vale para o novo.
      done_at: null,
    });

    await logTicket(user, buildingId, id, { forwarded_to: responsibleId });
    return toTicket(updated);
  },

  /**
   * O que o moderador acrescenta enquanto o chamado corre: a manutenção
   * necessária, o valor dela, e o estado intermediário.
   */
  async update(
    id: string,
    user: Actor,
    data: {
      responsible_id?: string | null;
      maintenance_note?: string | null;
      maintenance_cost?: number | null;
      status?: 'EM_ANDAMENTO' | 'AGUARDANDO_TERCEIRO';
    }
  ) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertModerator(user, buildingId);

    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    const patch: Prisma.MaintenanceRecordUncheckedUpdateInput = {};

    if (data.responsible_id !== undefined) {
      if (data.responsible_id === null) {
        patch.responsible_id = null;
      } else {
        const responsible = await assertResponsibleOfBuilding(buildingId, data.responsible_id);
        patch.responsible_id = data.responsible_id;
        patch.responsible = responsible.name;
      }
    }
    if (data.maintenance_note !== undefined) patch.maintenance_note = data.maintenance_note;
    if (data.maintenance_cost !== undefined) {
      patch.maintenance_cost =
        data.maintenance_cost === null ? null : new Prisma.Decimal(data.maintenance_cost);
    }
    if (data.status !== undefined) patch.status = data.status;

    const updated = await ticketRepository.update(id, patch);
    await logTicket(user, buildingId, id, { fields: Object.keys(patch) });
    return toTicket(updated);
  },

  /**
   * O responsável informa que terminou.
   *
   * Não fecha nada de propósito: o chamado fica "aguardando fechamento" e
   * continua na tela do moderador, que é quem encerra. É esta separação que dá
   * ao moderador o que validar.
   */
  async reportDone(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);

    const isAssigned = user.kind === 'USER' && ticket.responsible_id === user.id;
    if (!isAssigned && !(await canModerateBuilding(user, buildingId))) {
      throw new ForbiddenError('Este chamado não está com você');
    }

    if (ticket.status === RecordStatus.ABERTO) {
      throw new ConflictError('Este chamado ainda não foi encaminhado');
    }
    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.AGUARDANDO_FECHAMENTO,
      done_at: new Date(),
    });

    await logTicket(user, buildingId, id, { reported_done_by: user.id });
    return toTicket(updated);
  },

  /**
   * Fecha o chamado. É o único caminho para CONCLUIDO, e só o moderador passa
   * por ele — a regra central deste desenho.
   */
  async close(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertModerator(user, buildingId);

    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.CONCLUIDO,
      closed_at: new Date(),
      // Só conta de usuário assina o fechamento: `closed_by_id` aponta para
      // `users`, e o gestor não está lá. Quando é ele quem fecha, fica o log.
      closed_by_id: user.kind === 'USER' ? user.id : null,
    });

    await logTicket(user, buildingId, id, { closed_by: user.id, kind: user.kind });
    return toTicket(updated);
  },
};
