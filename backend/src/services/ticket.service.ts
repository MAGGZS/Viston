import { AuditAction, BuildingRole, Prisma, RecordStatus } from '@prisma/client';
import { ticketRepository, TicketRow, TicketUpdateRow } from '../repositories/ticket.repository';
import { buildingRepository, auditRepository, actorAudit } from '../repositories/building.repository';
import { Actor } from '../middlewares/authenticate';
import { canModerateBuilding, getBuildingStanding } from '../middlewares/buildingAccess';
import { managerRepository } from '../repositories/manager.repository';
import { userRepository } from '../repositories/user.repository';
import { storageService } from './storage.service';
import { decodeImageDataUrl, MAX_PHOTO_BYTES } from '../utils/image';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { TICKET_GROUPS, TicketFilters, TicketGroup } from '../validators/ticket.validator';
import { zonedTimeToUtc } from '../utils/timezone';

/** O afunilamento da listagem — tudo o que não é grupo, página nem tamanho. */
type TicketQuery = Omit<TicketFilters, 'group' | 'page' | 'limit'>;

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
    received_at: row.received_at,
    done_at: row.done_at,
    done_report: row.done_report,
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

/**
 * A atualização como a linha do tempo a lê.
 *
 * `author` é o nome congelado, e não o da conta: é ele que sobrevive à saída de
 * quem escreveu, e é o único que existe quando quem escreveu foi um gestor. A
 * foto vem da conta porque foto não se congela — se ela mudou, a atual é a
 * certa; se a conta sumiu, a linha fica sem foto e com nome, que é o que
 * importa.
 */
function toUpdate(row: TicketUpdateRow) {
  return {
    id: row.id,
    description: row.description,
    photos: row.photos,
    author: row.author_name,
    author_id: row.author_id,
    author_avatar: row.author?.avatar_url ?? null,
    created_at: row.created_at,
    edited_at: row.edited_at,
  };
}

/** Os estados em que existe manutenção a contar — e, portanto, linha do tempo. */
const COM_LINHA_DO_TEMPO: RecordStatus[] = [
  RecordStatus.EM_ANDAMENTO,
  RecordStatus.AGUARDANDO_TERCEIRO,
  RecordStatus.AGUARDANDO_FECHAMENTO,
  RecordStatus.CONCLUIDO,
];

/**
 * Nos quais ainda se escreve.
 *
 * A conclusão informada fecha a linha, e fecha para todo mundo — inclusive para
 * o moderador. O que o responsável entregou é o que o moderador vai validar, e
 * uma linha que continua crescendo depois da entrega não é mais a entrega: o
 * moderador leria hoje uma coisa e amanhã outra, sem saber que mudou.
 *
 * Quem precisa acrescentar cancela a conclusão (ver `undoDone`) — o chamado
 * volta a andar, e a linha volta a aceitar. É um gesto explícito, e é o que
 * mantém "concluído" querendo dizer alguma coisa.
 */
const ACEITA_ESCRITA: RecordStatus[] = [
  RecordStatus.EM_ANDAMENTO,
  RecordStatus.AGUARDANDO_TERCEIRO,
];

/** É o dono do chamado — a pessoa a quem ele foi encaminhado. */
function isAssignedTo(ticket: { responsible_id: string | null }, user: Actor) {
  return user.kind === 'USER' && ticket.responsible_id === user.id;
}

/**
 * Quem pode ler a linha do tempo: o responsável do chamado, ou quem tem
 * qualquer vínculo com o prédio.
 *
 * O vínculo basta porque a lista de ocorrências do prédio já é de membro (ver
 * `ticket.routes.ts`): quem enxerga a ocorrência enxerga o que se fez nela. O
 * que é de moderador continua sendo o gasto e as filas, não o relato.
 */
async function assertCanRead(ticket: TicketRow, buildingId: string, user: Actor) {
  if (isAssignedTo(ticket, user)) return;
  if (await getBuildingStanding(user, buildingId)) return;
  throw new ForbiddenError('Você não tem acesso a este chamado');
}

/**
 * Quem pode escrever nela: o responsável do chamado ou o moderador do prédio.
 *
 * `MODERADOR` estrito, e não `canModerateBuilding` — este é o único lugar do
 * módulo em que gestor não entra junto. A linha do tempo é o registro de quem
 * pôs a mão na manutenção; quem administra o prédio a lê e fecha o chamado com
 * base nela, e escrever ali confundiria as duas coisas.
 */
async function assertCanWrite(ticket: TicketRow, buildingId: string, user: Actor) {
  if (isAssignedTo(ticket, user)) return;
  if ((await getBuildingStanding(user, buildingId)) === BuildingRole.MODERADOR) return;
  throw new ForbiddenError('Só o responsável ou o moderador registram o andamento');
}

/** O nome de quem escreve, para congelar na linha. */
async function actorName(user: Actor): Promise<string> {
  const account =
    user.kind === 'MANAGER'
      ? await managerRepository.findById(user.id)
      : await userRepository.findById(user.id);

  return account?.name ?? 'Conta removida';
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
  /**
   * A fila do prédio, num dos grupos da barra lateral do moderador — e, com os
   * filtros, a lista ampliada do histórico de ocorrências.
   *
   * O `status` pedido é cruzado com o grupo, nunca somado: o grupo é o recorte
   * da tela, e um filtro que o furasse mostraria, na fila de novos, chamado que
   * já fechou. Pedir um status fora do grupo devolve lista vazia — que é a
   * resposta certa para "concluídos entre os novos".
   */
  async listByBuilding(
    buildingId: string,
    filters: { group: TicketGroup; page: number; limit: number } & TicketQuery
  ) {
    const doGrupo = [...TICKET_GROUPS[filters.group]] as RecordStatus[];
    const statuses = filters.status
      ? doGrupo.filter((s) => s === filters.status)
      : doGrupo;

    /**
     * A ordem padrão é a do grupo, e não uma só para todos.
     *
     * Nos finalizados a coluna que a pessoa lê é "Fechado em", e ordenar por
     * criação punha um chamado aberto em março e fechado ontem no fim da lista.
     * Nas demais filas nada fechou ainda, e a criação continua sendo a única
     * data que todas as linhas têm.
     *
     * Fica aqui, e não na tela: quem chama a API sem dizer nada merece a lista
     * na ordem certa, e não a ordem que a tela lembrou de pedir.
     */
    const sort =
      filters.sort ?? (filters.group === 'CONCLUIDOS' ? 'CLOSED_DESC' : undefined);

    const [rows, total] = await ticketRepository.findByBuilding({
      building_id: buildingId,
      statuses,
      page: filters.page,
      limit: filters.limit,
      floor_id: filters.floor_id,
      maintenance_type: filters.maintenance_type,
      category: filters.category,
      priority: filters.priority,
      responsible_id: filters.responsible_id,
      date_from: filters.date_from,
      date_to: filters.date_to,
      q: filters.q,
      sort,
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
   * Os contadores do painel: aberto, encaminhado, em andamento e concluído.
   *
   * "Em andamento" soma os três estados intermediários pelo mesmo motivo da
   * listagem — chamado que o responsável disse ter terminado ainda não fechou.
   * O encaminhado fica de fora dessa soma de propósito: ninguém o aceitou
   * ainda, e contá-lo como trabalho em curso esconderia justamente a fila que o
   * moderador tem de cobrar.
   */
  async stats(buildingId: string) {
    const counts = await ticketRepository.countByStatus(buildingId);
    return {
      abertos: counts.ABERTO,
      encaminhados: counts.ENCAMINHADO,
      em_andamento:
        counts.EM_ANDAMENTO + counts.AGUARDANDO_TERCEIRO + counts.AGUARDANDO_FECHAMENTO,
      aguardando_fechamento: counts.AGUARDANDO_FECHAMENTO,
      concluidos: counts.CONCLUIDO,
    };
  },

  /**
   * O resumo do período — o que os dois gráficos do painel desenham.
   *
   * Devolve as contagens cruas, um número por estado e um por categoria, e não
   * os agrupamentos que a tela mostra. A pizza junta EM_ANDAMENTO com
   * AGUARDANDO_TERCEIRO numa fatia só, e os contadores do topo juntam ainda o
   * AGUARDANDO_FECHAMENTO; se o servidor já entregasse somado, cada leitura
   * dessas viraria um campo próprio aqui, e mudar a fatia da tela viraria
   * mudança de API. O total vem junto porque é a conta que a pizza precisa para
   * virar porcentagem, e somá-la no cliente daria dois totais diferentes se um
   * dia alguma fatia ficasse de fora.
   */
  async summary(buildingId: string, period: { date_from?: Date; date_to?: Date }) {
    const { status, category } = await ticketRepository.countByStatusAndCategory(
      buildingId,
      period
    );

    return {
      by_status: status,
      by_category: category,
      total: Object.values(status).reduce((soma, n) => soma + n, 0),
    };
  },

  /** O que foi encaminhado a esta pessoa, em todos os prédios dela. */
  async listMine(user: Actor, includeClosed = false) {
    if (user.kind !== 'USER') return { tickets: [] };
    const rows = await ticketRepository.findByResponsible(user.id, includeClosed);
    return { tickets: rows.map(toTicket) };
  },

  /**
   * Um chamado só.
   *
   * Existe por causa da página da ocorrência: abrir o endereço dela do zero, ou
   * recarregar, não tem lista em cache de onde tirar o chamado — e antes disto
   * todo detalhe vinha por props de uma lista que a tela já tinha.
   */
  async getOne(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertCanRead(ticket, buildingId, user);
    return toTicket(ticket);
  },

  /**
   * Encaminha o chamado ao responsável — o gesto que tira a ocorrência da fila
   * de novos e a põe à espera de quem vai atendê-la.
   *
   * Encaminhar não é começar: o chamado para em ENCAMINHADO até o responsável
   * confirmar o recebimento (ver `receive`). Antes, ele já nascia EM_ANDAMENTO,
   * e o sistema afirmava que alguém tinha começado sem que essa pessoa
   * soubesse.
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
      status: RecordStatus.ENCAMINHADO,
      forwarded_at: new Date(),
      // Reencaminhar volta a aguardar aceite: o recebimento anterior era de
      // outra pessoa, e quem chega agora ainda não disse que pegou o chamado.
      received_at: null,
      // Encaminhar de novo reabre o trabalho: o "terminei" anterior era do
      // responsável antigo e não vale para o novo.
      done_at: null,
    });

    await logTicket(user, buildingId, id, { forwarded_to: responsibleId });
    return toTicket(updated);
  },

  /**
   * O responsável confirma que recebeu o chamado — e só então ele começa a
   * correr.
   *
   * É o passo que o encaminhamento deixou de fazer sozinho. Só quem está com o
   * chamado passa por aqui: nem o moderador, que encaminhou, nem o gestor
   * aceitam no lugar da pessoa — o aceite não valeria nada se outro pudesse
   * dá-lo, e é ele que diz que alguém sabe do trabalho.
   *
   * Fora de ENCAMINHADO não há o que receber: já recebido, ainda na fila de
   * novos ou fechado, o pedido é recusado em vez de mexer na data.
   */
  async receive(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);

    const isAssigned = user.kind === 'USER' && ticket.responsible_id === user.id;
    if (!isAssigned) {
      throw new ForbiddenError('Este chamado não está com você');
    }

    if (ticket.status !== RecordStatus.ENCAMINHADO) {
      if (ticket.status === RecordStatus.ABERTO) {
        throw new ConflictError('Este chamado ainda não foi encaminhado');
      }
      if (ticket.status === RecordStatus.CONCLUIDO) {
        throw new ConflictError('Este chamado já foi fechado');
      }
      throw new ConflictError('Este chamado já foi recebido');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.EM_ANDAMENTO,
      received_at: new Date(),
    });

    await logTicket(user, buildingId, id, { received_by: user.id });
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
   * ao moderador o que validar — e o relatório é o que ele valida: sem ele, o
   * chamado voltava só com uma data, e o que foi feito ficava fora do sistema.
   *
   * Concluir exige ao menos uma atualização na linha do tempo. O relatório
   * continua opcional, e a exigência não é sobre ele: é sobre haver algum
   * registro do trabalho. Sem isso, um chamado podia ir de "recebido" a
   * "concluído" sem que uma linha do sistema dissesse o que aconteceu no meio.
   */
  async reportDone(id: string, user: Actor, doneReport?: string | null) {
    const { ticket, buildingId } = await loadTicket(id);

    const isAssigned = isAssignedTo(ticket, user);
    if (!isAssigned && !(await canModerateBuilding(user, buildingId))) {
      throw new ForbiddenError('Este chamado não está com você');
    }

    if (ticket.status === RecordStatus.ABERTO) {
      throw new ConflictError('Este chamado ainda não foi encaminhado');
    }
    // Não se conclui o que não foi recebido: o chamado encaminhado espera o
    // aceite, e pular esse passo apagaria a fila que o moderador cobra.
    if (ticket.status === RecordStatus.ENCAMINHADO) {
      throw new ConflictError('Receba o chamado antes de informar a conclusão');
    }
    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    if ((await ticketRepository.countUpdates(id)) === 0) {
      throw new ConflictError('Registre ao menos uma atualização antes de concluir');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.AGUARDANDO_FECHAMENTO,
      done_at: new Date(),
      // Texto em branco apaga o relatório anterior; `undefined` não mexe nele —
      // é o que acontece quando o app conclui sem mandar campo nenhum.
      ...(doneReport === undefined ? {} : { done_report: doneReport || null }),
    });

    await logTicket(user, buildingId, id, { reported_done_by: user.id });
    return toTicket(updated);
  },

  /**
   * Desfaz a conclusão informada — o chamado volta a andar.
   *
   * É o par de `reportDone`, e o irmão de `unforward`: cada passo que muda o
   * estado do chamado sem fechá-lo tem a sua volta. Existe porque a conclusão
   * passou a trancar a linha do tempo, e sem esta porta quem concluiu cedo
   * demais — a peça que ainda ia chegar, o teste que faltou — não teria como
   * registrar o resto. Antes, a saída era o moderador reencaminhar, que zera o
   * recebimento e faz o chamado parecer novo para quem já estava nele.
   *
   * Volta para `EM_ANDAMENTO`, e não para o estado anterior: `AGUARDANDO_TERCEIRO`
   * era uma espera que já terminou quando a pessoa disse "terminei", e supor
   * que ela continua seria inventar um fato. Se ainda depende de terceiro, o
   * moderador o diz de novo (ver `update`).
   *
   * `done_report` fica. É o texto que a pessoa escreveu, e ela vai concluir de
   * novo daqui a pouco — apagá-lo seria cobrar que reescrevesse do zero. Some
   * da tela junto com `done_at`, porque é ele quem diz que houve conclusão.
   */
  async undoDone(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);

    // A mesma dupla de `reportDone`: quem pôde dizer "terminei" pode desdizer.
    if (!isAssignedTo(ticket, user) && !(await canModerateBuilding(user, buildingId))) {
      throw new ForbiddenError('Este chamado não está com você');
    }

    if (ticket.status !== RecordStatus.AGUARDANDO_FECHAMENTO) {
      if (ticket.status === RecordStatus.CONCLUIDO) {
        throw new ConflictError('Este chamado já foi fechado');
      }
      throw new ConflictError('Este chamado não está concluído');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.EM_ANDAMENTO,
      done_at: null,
    });

    await logTicket(user, buildingId, id, { undone_by: user.id });
    return toTicket(updated);
  },

  /**
   * Devolve o chamado à fila de novos, desfazendo o encaminhamento.
   *
   * Existe porque encaminhar para a pessoa errada não tinha volta: trocar de
   * responsável só passava o problema adiante, e a fila de "aguardando aceite"
   * ficava com um chamado que ninguém ia aceitar. Aqui ele volta a ser novo, sem
   * dono, e pode ser encaminhado de novo com calma.
   *
   * Só antes do aceite. Depois que o responsável confirmou o recebimento existe
   * trabalho começado, e apagá-lo em silêncio faria sumir o histórico de quem
   * pegou o chamado — nesse ponto o caminho é reencaminhar, que registra a
   * troca.
   */
  async unforward(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertModerator(user, buildingId);

    if (ticket.status !== RecordStatus.ENCAMINHADO) {
      if (ticket.status === RecordStatus.ABERTO) {
        throw new ConflictError('Este chamado não está encaminhado');
      }
      if (ticket.status === RecordStatus.CONCLUIDO) {
        throw new ConflictError('Este chamado já foi fechado');
      }
      throw new ConflictError('O responsável já recebeu este chamado — reencaminhe em vez de cancelar');
    }

    const updated = await ticketRepository.update(id, {
      status: RecordStatus.ABERTO,
      responsible_id: null,
      responsible: null,
      forwarded_at: null,
      received_at: null,
      done_at: null,
    });

    await logTicket(user, buildingId, id, { unforwarded_from: ticket.responsible_id });
    return toTicket(updated);
  },

  /**
   * Fecha o chamado. É o único caminho para CONCLUIDO, e só o moderador passa
   * por ele — a regra central deste desenho.
   *
   * O relatório do moderador entra aqui junto: fechar sem dizer por quê deixava
   * o chamado encerrado sem registro do que foi feito, e é esse texto que o
   * relatório do período depois publica. O gasto é opcional — nem toda
   * manutenção custa, e obrigar um número faria aparecer zero onde não houve
   * despesa nenhuma, que é uma informação diferente.
   */
  async close(
    id: string,
    user: Actor,
    data: { maintenance_note?: string | null; maintenance_cost?: number | null } = {}
  ) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertModerator(user, buildingId);

    if (ticket.status === RecordStatus.CONCLUIDO) {
      throw new ConflictError('Este chamado já foi fechado');
    }

    const patch: Prisma.MaintenanceRecordUncheckedUpdateInput = {};
    if (data.maintenance_note !== undefined) patch.maintenance_note = data.maintenance_note;
    if (data.maintenance_cost !== undefined) {
      patch.maintenance_cost =
        data.maintenance_cost === null ? null : new Prisma.Decimal(data.maintenance_cost);
    }

    const updated = await ticketRepository.update(id, {
      ...patch,
      status: RecordStatus.CONCLUIDO,
      closed_at: new Date(),
      // Só conta de usuário assina o fechamento: `closed_by_id` aponta para
      // `users`, e o gestor não está lá. Quando é ele quem fecha, fica o log.
      closed_by_id: user.kind === 'USER' ? user.id : null,
    });

    await logTicket(user, buildingId, id, { closed_by: user.id, kind: user.kind });
    return toTicket(updated);
  },

  /**
   * O relatório do período: o que foi fechado, e quanto custou.
   *
   * Devolve dados, não documento. Quem monta o `.docx` é `ticketReport.ts` — a
   * regra de "quais chamados entram" é do domínio, e a de "como isso vira um
   * arquivo do Word" não. Separadas, dá para mudar o layout do documento sem
   * tocar na consulta, e testar a consulta sem abrir um zip.
   *
   * As pontas chegam como dia de calendário ('AAAA-MM-DD') e viram instantes no
   * fuso do produto: o início é a meia-noite local do primeiro dia, e o fim o
   * último milissegundo do último. Tratá-las como UTC deslocaria o relatório em
   * três horas — quem pedisse agosto receberia de 31 de julho às 21h a 31 de
   * agosto às 21h, perdendo a última noite do mês e ganhando a véspera.
   */
  async reportPeriod(buildingId: string, user: Actor, from: string, to: string) {
    await assertModerator(user, buildingId);

    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const start = zonedTimeToUtc(fy, fm - 1, fd);
    const end = zonedTimeToUtc(ty, tm - 1, td, 23, 59, 59, 999);

    const rows = await ticketRepository.findClosedBetween(buildingId, start, end);
    const tickets = rows.map(toTicket);

    const building = await buildingRepository.findById(buildingId);

    return {
      building: { id: buildingId, name: building?.name ?? 'Prédio' },
      from: start,
      to: end,
      tickets,
      // Somado aqui, e não na tela: é a mesma conta para o documento e para
      // qualquer outro consumidor, e dinheiro somado em dois lugares diverge.
      total_cost: tickets.reduce((sum, t) => sum + (t.maintenance_cost ?? 0), 0),
    };
  },

  // ── A linha do tempo da manutenção ─────────────────────────────────────────

  /**
   * O andamento do chamado, do primeiro passo ao último.
   *
   * Devolve vazio, e não erro, nos estados sem linha do tempo: a ocorrência
   * aberta ou recém-encaminhada não tem nada a contar, e a tela que a abre não
   * precisa saber disso para desenhar.
   */
  async listUpdates(id: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertCanRead(ticket, buildingId, user);

    if (!COM_LINHA_DO_TEMPO.includes(ticket.status)) return { updates: [] };

    const rows = await ticketRepository.listUpdates(id);
    return { updates: rows.map(toUpdate) };
  },

  /**
   * Registra um passo da manutenção.
   *
   * As fotos sobem antes da linha ser gravada, e é a ordem certa: se o bucket
   * recusar, não fica atualização apontando para foto que não existe. O
   * contrário deixaria a linha do tempo mentindo.
   */
  async addUpdate(id: string, user: Actor, data: { description: string; photos: string[] }) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertCanWrite(ticket, buildingId, user);

    if (!ACEITA_ESCRITA.includes(ticket.status)) {
      if (ticket.status === RecordStatus.CONCLUIDO) {
        throw new ConflictError('Este chamado já foi fechado');
      }
      if (ticket.status === RecordStatus.AGUARDANDO_FECHAMENTO) {
        throw new ConflictError('Cancele a conclusão para registrar mais andamento');
      }
      throw new ConflictError('Receba o chamado antes de registrar o andamento');
    }

    const photos: string[] = [];
    for (const dataUrl of data.photos) {
      const { buffer, contentType } = decodeImageDataUrl(dataUrl, MAX_PHOTO_BYTES);
      photos.push(await storageService.uploadTicketPhoto(id, buffer, contentType));
    }

    const row = await ticketRepository.createUpdate({
      ticket_id: id,
      // Nulo quando quem escreve é gestor: ele não está em `users`. O nome
      // congelado ao lado é o que faz a linha continuar dizendo quem foi.
      author_id: user.kind === 'USER' ? user.id : null,
      author_name: await actorName(user),
      description: data.description,
      photos,
    });

    await logTicket(user, buildingId, id, { update_added: row.id });
    return toUpdate(row);
  },

  /**
   * Corrige o texto do último passo.
   *
   * Só o último, e só de quem o escreveu. O que já tem outra linha embaixo foi
   * lido — reescrevê-lo faria a linha do tempo deixar de valer como registro do
   * que aconteceu, que é a única coisa que ela serve para ser.
   */
  async editUpdate(id: string, updateId: string, user: Actor, description: string) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertCanWrite(ticket, buildingId, user);

    const last = await assertLastUpdateOwnedBy(id, updateId, user);
    const row = await ticketRepository.editUpdate(last.id, description);

    await logTicket(user, buildingId, id, { update_edited: last.id });
    return toUpdate(row);
  },

  /** Apaga o último passo — e as fotos dele, que não servem a mais ninguém. */
  async removeUpdate(id: string, updateId: string, user: Actor) {
    const { ticket, buildingId } = await loadTicket(id);
    await assertCanWrite(ticket, buildingId, user);

    const last = await assertLastUpdateOwnedBy(id, updateId, user);
    await ticketRepository.removeUpdate(last.id);

    // Depois de apagar a linha: falha no bucket deixa um arquivo órfão, e isso
    // é bem melhor que uma linha viva sem as fotos que ela cita.
    for (const url of last.photos) await storageService.removeTicketPhoto(url);

    await logTicket(user, buildingId, id, { update_removed: last.id });
    return { ok: true };
  },
};

/**
 * A atualização existe, é a última do chamado, e é de quem está pedindo.
 *
 * A autoria é conferida por `author_id` quando ela existe; quando é nula, quem
 * escreveu foi um gestor — e gestor não escreve aqui (ver `assertCanWrite`), o
 * que só acontece com linha antiga de um vínculo que mudou. Nesse caso ninguém
 * altera, que é o mais seguro dos dois erros.
 */
async function assertLastUpdateOwnedBy(ticketId: string, updateId: string, user: Actor) {
  const last = await ticketRepository.lastUpdate(ticketId);
  if (!last) throw new NotFoundError('Atualização');

  if (last.id !== updateId) {
    throw new ConflictError('Só a última atualização pode ser alterada');
  }
  if (user.kind !== 'USER' || last.author_id !== user.id) {
    throw new ForbiddenError('Esta atualização foi escrita por outra pessoa');
  }

  return last;
}
