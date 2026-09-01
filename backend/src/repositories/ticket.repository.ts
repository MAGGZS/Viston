import {
  MaintenanceCategory,
  MaintenanceType,
  Prisma,
  Priority,
  RecordStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Tudo que a tela de chamado mostra sobre uma ocorrência.
 *
 * O prédio não é coluna daqui: a ocorrência pertence a um andar, o andar a uma
 * vistoria, e a vistoria a um prédio. Por isso toda consulta desce por
 * `floor_form_entry.report` — e é de lá que sai também a data e quem vistoriou,
 * que é o contexto sem o qual a descrição não quer dizer nada.
 */
const ticketInclude = {
  responsible_user: { select: { id: true, name: true, email: true, avatar_url: true } },
  closed_by: { select: { id: true, name: true } },
  floor_form_entry: {
    select: {
      id: true,
      status_geral: true,
      floor: { select: { id: true, label: true } },
      report: {
        select: {
          id: true,
          date: true,
          building_id: true,
          building: { select: { id: true, name: true } },
          inspector: { select: { id: true, name: true, avatar_url: true } },
        },
      },
    },
  },
} satisfies Prisma.MaintenanceRecordInclude;

export type TicketRow = Prisma.MaintenanceRecordGetPayload<{ include: typeof ticketInclude }>;

/**
 * A conta de quem escreveu, ao lado da atualização.
 *
 * Só a foto interessa aqui — o nome vem congelado em `author_name`, que é o que
 * continua valendo quando a conta some ou quando quem escreveu foi um gestor,
 * que nem está em `users`.
 */
const updateInclude = {
  author: { select: { id: true, name: true, avatar_url: true } },
} satisfies Prisma.TicketUpdateInclude;

export type TicketUpdateRow = Prisma.TicketUpdateGetPayload<{ include: typeof updateInclude }>;

/** Filtro "as ocorrências deste prédio", escrito uma vez só. */
function inBuilding(buildingId: string): Prisma.MaintenanceRecordWhereInput {
  return { floor_form_entry: { report: { building_id: buildingId } } };
}

/**
 * Todo estado e toda categoria começam em zero.
 *
 * O `groupBy` só devolve linha para o que existe, e uma contagem que omite o
 * que deu zero obriga cada tela a saber a lista inteira para desenhar as
 * fatias que faltam — e a errar quando o enum crescer. Aqui o zero é dado.
 */
const ZERO_STATUS = {
  ABERTO: 0,
  ENCAMINHADO: 0,
  EM_ANDAMENTO: 0,
  AGUARDANDO_TERCEIRO: 0,
  AGUARDANDO_FECHAMENTO: 0,
  CONCLUIDO: 0,
} as Record<RecordStatus, number>;

const ZERO_CATEGORY = {
  PREVENTIVA: 0,
  CORRETIVA: 0,
  EMERGENCIAL: 0,
  EVENTOS: 0,
  PROJETOS: 0,
} as Record<MaintenanceCategory, number>;

/** As linhas de um `groupBy` sobre o mapa zerado daquela coluna. */
function fill<K extends string>(
  zero: Record<K, number>,
  rows: Array<{ _count: { _all: number } } & Record<string, unknown>>,
  key: string
): Record<K, number> {
  const counted = { ...zero };
  for (const row of rows) counted[row[key] as K] = row._count._all;
  return counted;
}

export const ticketRepository = {
  findById(id: string) {
    return prisma.maintenanceRecord.findUnique({ where: { id }, include: ticketInclude });
  },

  /**
   * Os chamados do prédio num dos estados da tela, do mais novo para o mais
   * velho — a mesma leitura do histórico, só que ocorrência por ocorrência.
   */
  findByBuilding(filters: {
    building_id: string;
    statuses: RecordStatus[];
    page: number;
    limit: number;
    floor_id?: string;
    maintenance_type?: MaintenanceType;
    category?: MaintenanceCategory;
    priority?: Priority;
    responsible_id?: string;
    date_from?: Date;
    date_to?: Date;
    /** Texto solto na descrição. */
    q?: string;
    /** A ordem da lista. Ausente, é a de sempre: do mais novo para o mais velho. */
    sort?: 'CLOSED_DESC' | 'CLOSED_ASC';
  }) {
    const { floor_id, maintenance_type, category, priority, responsible_id, date_from, date_to, q } =
      filters;

    /**
     * O que desce até a vistoria: o andar e o dia.
     *
     * Os dois moram lá, e não na ocorrência — a ocorrência pertence a um andar,
     * o andar a uma vistoria, e é ela que tem a data. Por isso um objeto só,
     * montado de uma vez: dois `floor_form_entry` no mesmo `where` fariam o
     * segundo apagar o primeiro.
     */
    const daVistoria: Prisma.FloorFormEntryWhereInput = {
      ...(floor_id && { floor_id }),
      ...(date_from || date_to
        ? {
            report: {
              date: {
                ...(date_from && { gte: date_from }),
                ...(date_to && { lte: date_to }),
              },
            },
          }
        : {}),
    };

    const where: Prisma.MaintenanceRecordWhereInput = {
      ...inBuilding(filters.building_id),
      status: { in: filters.statuses },
      ...(maintenance_type && { maintenance_type }),
      ...(category && { category }),
      ...(priority && { priority }),
      ...(responsible_id && { responsible_id }),
      ...(q && { description: { contains: q, mode: 'insensitive' as const } }),
      // `AND` e não outro `floor_form_entry`: a chave do prédio já ocupa esse
      // nome (ver `inBuilding`), e repeti-la aqui descartaria o recorte do
      // prédio — o filtro de andar passaria a ler o sistema inteiro.
      ...(Object.keys(daVistoria).length ? { AND: [{ floor_form_entry: daVistoria }] } : {}),
    };

    /**
     * A ordem da lista, e o desempate.
     *
     * `closed_at` é nulo em tudo que ainda não fechou, e por isso o `nulls`
     * é dito à mão: o padrão do Postgres põe nulo primeiro no crescente, e a
     * lista abriria com o que nem tem data.
     *
     * O `id` no fim não é decoração. Sem um critério que nunca empata, duas
     * linhas com o mesmo instante podem trocar de lugar entre uma página e a
     * seguinte — e aí uma delas aparece duas vezes e outra some, sem nada na
     * tela dizendo que isso aconteceu.
     */
    const porData: Record<string, Prisma.MaintenanceRecordOrderByWithRelationInput> = {
      CLOSED_DESC: { closed_at: { sort: 'desc', nulls: 'last' } },
      CLOSED_ASC: { closed_at: { sort: 'asc', nulls: 'last' } },
    };

    const orderBy: Prisma.MaintenanceRecordOrderByWithRelationInput[] = [
      filters.sort ? porData[filters.sort] : { created_at: 'desc' },
      { id: 'desc' },
    ];

    return Promise.all([
      prisma.maintenanceRecord.findMany({
        where,
        include: ticketInclude,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.maintenanceRecord.count({ where }),
    ]);
  },

  /**
   * Os chamados encaminhados a uma pessoa, em todos os prédios dela.
   *
   * O responsável não escolhe prédio: ele abre o app e vê o que é dele. Os já
   * fechados ficam de fora — quem fechou foi o moderador, e a lista dele é de
   * trabalho, não de arquivo.
   *
   * ENCAMINHADO abre a lista de propósito: é o chamado que espera o aceite
   * dele, e deixá-lo de fora esconderia justamente o que ele tem de receber
   * para que o trabalho comece.
   */
  findByResponsible(responsibleId: string, includeClosed = false) {
    return prisma.maintenanceRecord.findMany({
      where: {
        responsible_id: responsibleId,
        status: includeClosed
          ? { not: RecordStatus.ABERTO }
          : {
              in: [
                RecordStatus.ENCAMINHADO,
                RecordStatus.EM_ANDAMENTO,
                RecordStatus.AGUARDANDO_TERCEIRO,
                RecordStatus.AGUARDANDO_FECHAMENTO,
              ],
            },
      },
      include: ticketInclude,
      orderBy: { created_at: 'desc' },
    });
  },

  /** Quantos chamados em cada estado — os contadores do painel do moderador. */
  async countByStatus(buildingId: string): Promise<Record<RecordStatus, number>> {
    const rows = await prisma.maintenanceRecord.groupBy({
      by: ['status'],
      where: inBuilding(buildingId),
      _count: { _all: true },
    });

    return fill(ZERO_STATUS, rows, 'status');
  },

  /**
   * O mesmo prédio partido de duas maneiras dentro de um período: por estado e
   * por categoria. É o que os dois gráficos do painel desenham.
   *
   * Uma chamada só para as duas leituras porque a pergunta é uma só — "o que
   * aconteceu neste período" —, e são os mesmos registros contados por colunas
   * diferentes. Duas rotas fariam a tela pedir duas vezes o mesmo recorte.
   *
   * Contado no banco, e não sobre uma página trazida à tela: o painel resume o
   * prédio inteiro, e uma soma feita sobre as trinta linhas da primeira página
   * mentiria em qualquer prédio com mais do que isso.
   *
   * O corte de data é o do dia vistoriado, como no resto do produto — a data
   * mora na vistoria, não na ocorrência (ver `findByBuilding`).
   */
  async countByStatusAndCategory(
    buildingId: string,
    period: { date_from?: Date; date_to?: Date } = {}
  ): Promise<{
    status: Record<RecordStatus, number>;
    category: Record<MaintenanceCategory, number>;
  }> {
    const { date_from, date_to } = period;

    const where: Prisma.MaintenanceRecordWhereInput = {
      ...inBuilding(buildingId),
      ...(date_from || date_to
        ? {
            AND: [
              {
                floor_form_entry: {
                  report: {
                    date: {
                      ...(date_from && { gte: date_from }),
                      ...(date_to && { lte: date_to }),
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [porStatus, porCategoria] = await Promise.all([
      prisma.maintenanceRecord.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.maintenanceRecord.groupBy({ by: ['category'], where, _count: { _all: true } }),
    ]);

    return {
      status: fill(ZERO_STATUS, porStatus, 'status'),
      category: fill(ZERO_CATEGORY, porCategoria, 'category'),
    };
  },

  /**
   * Os chamados fechados do prédio dentro de um período — a matéria-prima do
   * relatório em .docx.
   *
   * O corte é por `closed_at`, e não por quando a ocorrência nasceu: o relatório
   * responde "o que foi resolvido neste mês", e uma ocorrência aberta em janeiro
   * e fechada em março pertence a março. Sem paginação de propósito — o
   * documento é do período inteiro, e devolvê-lo pela metade seria pior do que
   * demorar.
   *
   * Da mais antiga para a mais nova: o documento se lê como uma linha do tempo,
   * ao contrário das telas, que mostram o mais recente primeiro.
   */
  findClosedBetween(buildingId: string, from: Date, to: Date) {
    return prisma.maintenanceRecord.findMany({
      where: {
        ...inBuilding(buildingId),
        status: RecordStatus.CONCLUIDO,
        closed_at: { gte: from, lte: to },
      },
      include: ticketInclude,
      orderBy: { closed_at: 'asc' },
    });
  },

  update(id: string, data: Prisma.MaintenanceRecordUncheckedUpdateInput) {
    return prisma.maintenanceRecord.update({ where: { id }, data, include: ticketInclude });
  },

  // ── A linha do tempo da manutenção ─────────────────────────────────────────

  /**
   * As atualizações do chamado, da primeira à última.
   *
   * Ordem crescente, ao contrário de todas as outras listas daqui: é uma
   * narrativa, e narrativa se lê do começo. O que a tela destaca é a ponta,
   * mas quem chega precisa saber onde a história começou.
   *
   * O autor vem junto pela foto — a linha do tempo mostra quem escreveu cada
   * passo, e sem ele a tela pediria um usuário por entrada.
   */
  listUpdates(ticketId: string) {
    return prisma.ticketUpdate.findMany({
      where: { ticket_id: ticketId },
      include: updateInclude,
      orderBy: { created_at: 'asc' },
    });
  },

  /**
   * A última atualização do chamado, ou nada.
   *
   * É o que sustenta a regra de edição: só a ponta se altera. A comparação é
   * por id, e não por data — duas linhas gravadas no mesmo milissegundo
   * empatariam, e a decisão de qual delas é "a última" precisa ser a mesma que
   * a listagem toma.
   */
  lastUpdate(ticketId: string) {
    return prisma.ticketUpdate.findFirst({
      where: { ticket_id: ticketId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  },

  countUpdates(ticketId: string) {
    return prisma.ticketUpdate.count({ where: { ticket_id: ticketId } });
  },

  createUpdate(data: Prisma.TicketUpdateUncheckedCreateInput) {
    return prisma.ticketUpdate.create({
      data,
      include: updateInclude,
    });
  },

  editUpdate(id: string, description: string) {
    return prisma.ticketUpdate.update({
      where: { id },
      data: { description, edited_at: new Date() },
      include: updateInclude,
    });
  },

  removeUpdate(id: string) {
    return prisma.ticketUpdate.delete({ where: { id } });
  },
};
