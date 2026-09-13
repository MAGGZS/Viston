import { MaintenanceCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APP_TIMEZONE } from '../utils/timezone';
import { sqlBusinessDaysBetween, sqlSlaLimit } from '../utils/sla';

/**
 * As contas do painel analítico.
 *
 * É o primeiro SQL cru do projeto, e ele existe por um motivo só: as perguntas
 * do painel são somas sobre o prédio inteiro, e respondê-las trazendo as linhas
 * para contar em JavaScript seria pedir alguns milhares de registros por tela
 * para devolver oito números. O `groupBy` do Prisma dá conta de "quantos por
 * estado"; não dá conta de "média de horas entre dois carimbos, por etapa,
 * dentro do período, comparada com o período anterior".
 *
 * Duas regras valem em todas as consultas daqui:
 *
 * - **O prédio não é coluna.** Toda linha desce por `floor_form_entry → report`
 *   para saber de que prédio é. É a mesma travessia do `inBuilding()` da
 *   listagem, escrita em SQL.
 * - **O período tem dois eixos.** O que nasceu no período recorta por
 *   `report.date`, que já é um dia do calendário local. O que fechou no período
 *   recorta por `closed_at`, que é instante e precisa ser lido no fuso do
 *   produto antes de virar dia.
 */

/** O fuso do produto, como literal SQL. */
const TZ = `'${APP_TIMEZONE}'`;

/** O dia em que o chamado nasceu: o da vistoria que o abriu. */
const ABERTO_EM = 'b.aberto_em';

/**
 * O dia em que o relógio do prazo parou.
 *
 * Fechado, é o dia do fechamento lido no fuso local — sem isso um chamado
 * fechado às 21h30 contaria como fechado no dia seguinte. Aberto, é hoje.
 */
const FIM_DO_RELOGIO = `COALESCE((b.closed_at AT TIME ZONE ${TZ})::date, (now() AT TIME ZONE ${TZ})::date)`;

/** Dias úteis já consumidos — a mesma conta de `computeSla`, em SQL. */
const DIAS_CONSUMIDOS = sqlBusinessDaysBetween(ABERTO_EM, FIM_DO_RELOGIO);

/** O prazo da prioridade da linha. */
const LIMITE = sqlSlaLimit('b.priority');

/** Passou do prazo. Vale também para o que já fechou: o atraso não se cura. */
const ATRASADO = `${DIAS_CONSUMIDOS} > ${LIMITE}`;

/** O instante da meia-noite local do dia da vistoria — o zero do funil. */
const ABERTURA_INSTANTE = `(b.aberto_em::timestamp AT TIME ZONE ${TZ})`;

/** Horas entre dois carimbos, como número. */
function horas(de: string, ate: string) {
  return `EXTRACT(EPOCH FROM (${ate} - ${de})) / 3600.0`;
}

export type AnalyticsScope = {
  building_id: string;
  responsible_id?: string;
  floor_id?: string;
  category?: MaintenanceCategory;
};

/** O intervalo de um período, nos dois eixos em que ele é lido. */
export type PeriodRange = {
  /** Dias do calendário local, para `report.date`. */
  from_day: string;
  to_day: string;
  /** Instantes, para os carimbos que têm hora. */
  from_instant: Date;
  to_instant: Date;
};

/**
 * As ocorrências do prédio, já afuniladas pelos filtros da tela.
 *
 * Sai como CTE porque todas as contas do painel partem do mesmo conjunto: um
 * `WHERE` repetido em oito consultas é onde um filtro esquecido faz dois
 * números da mesma tela discordarem.
 */
function base(scope: AnalyticsScope) {
  const filtros: Prisma.Sql[] = [Prisma.sql`r.building_id = ${scope.building_id}`];

  if (scope.responsible_id) filtros.push(Prisma.sql`mr.responsible_id = ${scope.responsible_id}`);
  if (scope.floor_id) filtros.push(Prisma.sql`ffe.floor_id = ${scope.floor_id}`);
  if (scope.category) {
    filtros.push(Prisma.sql`mr.category = ${scope.category}::"MaintenanceCategory"`);
  }

  return Prisma.sql`
    SELECT
      mr.id, mr.status, mr.priority, mr.category, mr.maintenance_type,
      mr.responsible_id, mr.maintenance_cost, mr.description,
      mr.forwarded_at, mr.received_at, mr.done_at, mr.closed_at,
      ffe.floor_id,
      r.date AS aberto_em
    FROM maintenance_records mr
    JOIN floor_form_entries ffe ON ffe.id = mr.floor_form_entry_id
    JOIN inspection_reports r ON r.id = ffe.report_id
    WHERE ${Prisma.join(filtros, ' AND ')}
  `;
}

/** "Nasceu neste período" — o eixo do dia da vistoria. */
function nasceuEm(p: PeriodRange) {
  return Prisma.sql`b.aberto_em BETWEEN ${p.from_day}::date AND ${p.to_day}::date`;
}

/** "Fechou neste período" — o eixo do instante. */
function fechouEm(p: PeriodRange) {
  return Prisma.sql`b.closed_at BETWEEN ${p.from_instant} AND ${p.to_instant}`;
}

export type OverviewRow = {
  total: number;
  abertos: number;
  encaminhados: number;
  em_andamento: number;
  concluidos: number;
  atrasados: number;
  total_anterior: number;
  abertos_anterior: number;
  encaminhados_anterior: number;
  em_andamento_anterior: number;
  concluidos_anterior: number;
  atrasados_anterior: number;
  fechados: number;
  fechados_anterior: number;
  fechados_no_prazo: number;
  fechados_no_prazo_anterior: number;
  tempo_medio: number | null;
  tempo_medio_anterior: number | null;
  etapa1_media: number | null;
  etapa1_mediana: number | null;
  etapa2_media: number | null;
  etapa2_mediana: number | null;
  etapa3_media: number | null;
  etapa3_mediana: number | null;
  etapa4_media: number | null;
  etapa4_mediana: number | null;
  parados1: number;
  parados2: number;
  parados3: number;
  parados4: number;
};

export type PrioridadeRow = {
  priority: 'ALTA' | 'MEDIA' | 'BAIXA';
  /** Nasceram no período — o eixo da vistoria. */
  nascidos: number;
  nascidos_atrasados: number;
  /** Fecharam no período — o eixo do fechamento. */
  fechados: number;
  fechados_atrasados: number;
  media_dias_uteis: number | null;
};

export type EmRiscoRow = {
  id: string;
  priority: 'ALTA' | 'MEDIA' | 'BAIXA';
  maintenance_type: string;
  description: string;
  floor_label: string | null;
  responsible: string | null;
  dias: number;
  limite: number;
};

export type ProcessoRow = {
  /** Balanço: o que entrou e o que saiu, nos dois períodos. */
  nasceram: number;
  fecharam: number;
  nasceram_anterior: number;
  fecharam_anterior: number;
  /** A fila de hoje — prédio inteiro, sem recorte de período. */
  em_aberto_agora: number;
  backlog_mais_velho: number | null;
  backlog_mediana: number | null;
  sem_movimento: number;
  /** Desvios de processo, no período. */
  fechados_sem_responsavel: number;
  concluidos_com_custo: number;
  altas: number;
  /** Retrabalho, do log de auditoria. */
  com_volta: number;
  reencaminhados: number;
};

export type MesRow = {
  mes: number;
  abertos: number;
  fechados: number;
};

export type InspetorRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  vistorias: number;
  dias: number;
  andares_distintos: number;
  ocorrencias: number;
  altas: number;
  minutos_medios: number | null;
  vistorias_sem_ocorrencia: number;
  ultima: string | null;
};

export type ResponsavelRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  recebidos: number;
  concluidos: number;
  em_andamento_agora: number;
  tempo_medio: number | null;
  fechados_atrasados: number;
  abertos_atrasados: number;
  custo: number | null;
};

export const analyticsRepository = {
  /**
   * Tudo o que a visão geral precisa, numa consulta só.
   *
   * Os dois períodos saem do mesmo varrimento, por `FILTER`: rodar a mesma
   * consulta duas vezes com intervalos diferentes abre a porta para os filtros
   * divergirem entre a contagem e a comparação dela.
   */
  async overview(scope: AnalyticsScope, atual: PeriodRange, anterior: PeriodRange) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const atrasado = Prisma.raw(ATRASADO);
    const e1 = Prisma.raw(horas(ABERTURA_INSTANTE, 'b.forwarded_at'));
    const e2 = Prisma.raw(horas('b.forwarded_at', 'b.received_at'));
    const e3 = Prisma.raw(horas('b.received_at', 'b.done_at'));
    const e4 = Prisma.raw(horas('b.done_at', 'b.closed_at'));

    const nasceuAtual = nasceuEm(atual);
    const nasceuAnterior = nasceuEm(anterior);
    const fechouAtual = fechouEm(atual);
    const fechouAnterior = fechouEm(anterior);

    const rows = await prisma.$queryRaw<OverviewRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        COUNT(*) FILTER (WHERE ${nasceuAtual})::int AS total,
        COUNT(*) FILTER (WHERE ${nasceuAtual} AND b.status = 'ABERTO')::int AS abertos,
        COUNT(*) FILTER (WHERE ${nasceuAtual} AND b.status = 'ENCAMINHADO')::int AS encaminhados,
        COUNT(*) FILTER (WHERE ${nasceuAtual} AND b.status IN ('EM_ANDAMENTO','AGUARDANDO_TERCEIRO','AGUARDANDO_FECHAMENTO'))::int AS em_andamento,
        COUNT(*) FILTER (WHERE ${nasceuAtual} AND b.status = 'CONCLUIDO')::int AS concluidos,
        COUNT(*) FILTER (WHERE ${nasceuAtual} AND ${atrasado})::int AS atrasados,

        COUNT(*) FILTER (WHERE ${nasceuAnterior})::int AS total_anterior,
        COUNT(*) FILTER (WHERE ${nasceuAnterior} AND b.status = 'ABERTO')::int AS abertos_anterior,
        COUNT(*) FILTER (WHERE ${nasceuAnterior} AND b.status = 'ENCAMINHADO')::int AS encaminhados_anterior,
        COUNT(*) FILTER (WHERE ${nasceuAnterior} AND b.status IN ('EM_ANDAMENTO','AGUARDANDO_TERCEIRO','AGUARDANDO_FECHAMENTO'))::int AS em_andamento_anterior,
        COUNT(*) FILTER (WHERE ${nasceuAnterior} AND b.status = 'CONCLUIDO')::int AS concluidos_anterior,
        COUNT(*) FILTER (WHERE ${nasceuAnterior} AND ${atrasado})::int AS atrasados_anterior,

        COUNT(*) FILTER (WHERE ${fechouAtual})::int AS fechados,
        COUNT(*) FILTER (WHERE ${fechouAnterior})::int AS fechados_anterior,
        COUNT(*) FILTER (WHERE ${fechouAtual} AND NOT ${atrasado})::int AS fechados_no_prazo,
        COUNT(*) FILTER (WHERE ${fechouAnterior} AND NOT ${atrasado})::int AS fechados_no_prazo_anterior,
        AVG(${consumidos}) FILTER (WHERE ${fechouAtual})::float8 AS tempo_medio,
        AVG(${consumidos}) FILTER (WHERE ${fechouAnterior})::float8 AS tempo_medio_anterior,

        AVG(${e1}) FILTER (WHERE ${nasceuAtual})::float8 AS etapa1_media,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${e1}) FILTER (WHERE ${nasceuAtual}))::float8 AS etapa1_mediana,
        AVG(${e2}) FILTER (WHERE ${nasceuAtual})::float8 AS etapa2_media,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${e2}) FILTER (WHERE ${nasceuAtual}))::float8 AS etapa2_mediana,
        AVG(${e3}) FILTER (WHERE ${nasceuAtual})::float8 AS etapa3_media,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${e3}) FILTER (WHERE ${nasceuAtual}))::float8 AS etapa3_mediana,
        AVG(${e4}) FILTER (WHERE ${nasceuAtual})::float8 AS etapa4_media,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${e4}) FILTER (WHERE ${nasceuAtual}))::float8 AS etapa4_mediana,

        COUNT(*) FILTER (WHERE b.status = 'ABERTO')::int AS parados1,
        COUNT(*) FILTER (WHERE b.status = 'ENCAMINHADO')::int AS parados2,
        COUNT(*) FILTER (WHERE b.status IN ('EM_ANDAMENTO','AGUARDANDO_TERCEIRO'))::int AS parados3,
        COUNT(*) FILTER (WHERE b.status = 'AGUARDANDO_FECHAMENTO')::int AS parados4
      FROM b
    `;

    return rows[0];
  },

  /**
   * O prazo por prioridade — onde os atrasos se concentram.
   *
   * As duas leituras saem lado a lado e nomeadas, em vez de somadas numa só:
   * "quantos nasceram atrasando" e "quantos fecharam atrasados" são perguntas
   * diferentes, e um mês em que nada nasceu mas duas coisas velhas fecharam
   * atrasadas responde zero à primeira e dois à segunda. Misturá-las produzia
   * uma tela que dizia "2 atrasados" ao lado de uma quebra por prioridade
   * vazia.
   */
  async porPrioridade(scope: AnalyticsScope, periodo: PeriodRange) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const atrasado = Prisma.raw(ATRASADO);
    const nasceu = nasceuEm(periodo);
    const fechou = fechouEm(periodo);

    return prisma.$queryRaw<PrioridadeRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        b.priority::text AS priority,
        COUNT(*) FILTER (WHERE ${nasceu})::int AS nascidos,
        COUNT(*) FILTER (WHERE ${nasceu} AND ${atrasado})::int AS nascidos_atrasados,
        COUNT(*) FILTER (WHERE ${fechou})::int AS fechados,
        COUNT(*) FILTER (WHERE ${fechou} AND ${atrasado})::int AS fechados_atrasados,
        AVG(${consumidos}) FILTER (WHERE ${fechou})::float8 AS media_dias_uteis
      FROM b
      WHERE ${nasceu} OR ${fechou}
      GROUP BY b.priority
    `;
  },

  /**
   * Os que ainda vão estourar.
   *
   * Não recorta por período de propósito: um chamado de dois meses atrás
   * prestes a estourar é exatamente o que a tela precisa mostrar hoje, e
   * escondê-lo porque nasceu fora do mês escolhido seria a tela ajudando a
   * perder o prazo. Quem já estourou não entra aqui — está na contagem de
   * atrasados, e o critério é o mesmo `em_risco` de `computeSla`.
   */
  async emRisco(scope: AnalyticsScope, limit = 10) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const limite = Prisma.raw(LIMITE);
    const atrasado = Prisma.raw(ATRASADO);

    return prisma.$queryRaw<EmRiscoRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        b.id,
        b.priority::text AS priority,
        b.maintenance_type::text AS maintenance_type,
        b.description,
        f.label AS floor_label,
        u.name AS responsible,
        ${consumidos}::int AS dias,
        ${limite}::int AS limite
      FROM b
      LEFT JOIN floors f ON f.id = b.floor_id
      LEFT JOIN users u ON u.id = b.responsible_id
      WHERE b.closed_at IS NULL
        AND ${consumidos} >= ${limite} * 0.8
        AND NOT ${atrasado}
      ORDER BY (${consumidos}::float8 / ${limite}) DESC, b.priority ASC
      LIMIT ${limit}
    `;
  },

  /**
   * A saúde do processo: o que o fluxo revela além do tempo de cada etapa.
   *
   * Três leituras convivem aqui, e elas têm bases diferentes de propósito:
   *
   * - **Balanço** (nasceram/fecharam) é do período, e responde "a fila cresceu
   *   ou encolheu". É o número que decide se falta gente — e não existia em
   *   lugar nenhum do painel, embora seja o mais direto de todos.
   * - **Fila de hoje** (em aberto, mais velho, sem movimento) é o prédio
   *   inteiro neste instante. Um chamado de março esquecido não pertence a mês
   *   nenhum do filtro; ele pertence a hoje.
   * - **Desvios** (fechado sem responsável, retrabalho) são do período, e
   *   contam o que o fluxo feliz esconde: o moderador que fecha sem execução, o
   *   encaminhamento cancelado, a conclusão desfeita.
   *
   * O retrabalho sai do log de auditoria, que é onde ele existe: `unforward` e
   * `undone` apagam as colunas que preencheram (`forwarded_at`, `done_at`), e
   * por isso a linha do chamado não guarda memória da volta. O log guarda, com
   * uma chave por transição (ver `logTicket` em services/ticket.service.ts).
   */
  async saudeDoProcesso(
    scope: AnalyticsScope,
    atual: PeriodRange,
    anterior: PeriodRange,
    diasSemMovimento: number
  ) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const nasceu = nasceuEm(atual);
    const fechou = fechouEm(atual);
    const nasceuAnterior = nasceuEm(anterior);
    const fechouAnterior = fechouEm(anterior);

    /**
     * O último sinal de vida do chamado.
     *
     * Encaminhar, receber, informar conclusão e escrever na linha do tempo são
     * as quatro formas de mexer num chamado. Sem nenhuma delas, o último toque
     * é a própria vistoria que o abriu — e é daí que a conta parte, em vez de
     * o chamado nunca tocado aparecer como recém-mexido.
     */
    const ULTIMO_TOQUE = `GREATEST(
      ${ABERTURA_INSTANTE},
      COALESCE(b.forwarded_at, ${ABERTURA_INSTANTE}),
      COALESCE(b.received_at, ${ABERTURA_INSTANTE}),
      COALESCE(b.done_at, ${ABERTURA_INSTANTE}),
      COALESCE(t.ultima_linha, ${ABERTURA_INSTANTE})
    )`;

    const diasParado = Prisma.raw(
      sqlBusinessDaysBetween(
        `(${ULTIMO_TOQUE} AT TIME ZONE ${TZ})::date`,
        `(now() AT TIME ZONE ${TZ})::date`
      )
    );

    const rows = await prisma.$queryRaw<ProcessoRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        COUNT(*) FILTER (WHERE ${nasceu})::int AS nasceram,
        COUNT(*) FILTER (WHERE ${fechou})::int AS fecharam,
        COUNT(*) FILTER (WHERE ${nasceuAnterior})::int AS nasceram_anterior,
        COUNT(*) FILTER (WHERE ${fechouAnterior})::int AS fecharam_anterior,

        COUNT(*) FILTER (WHERE b.closed_at IS NULL)::int AS em_aberto_agora,
        MAX(${consumidos}) FILTER (WHERE b.closed_at IS NULL)::int AS backlog_mais_velho,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${consumidos})
          FILTER (WHERE b.closed_at IS NULL))::float8 AS backlog_mediana,
        COUNT(*) FILTER (WHERE b.closed_at IS NULL AND ${diasParado} >= ${diasSemMovimento})::int AS sem_movimento,

        -- Fechado sem ninguém ter recebido: ou o moderador resolveu sozinho, ou
        -- fechou sem execução. Os dois casos valem uma olhada.
        COUNT(*) FILTER (WHERE ${fechou} AND b.received_at IS NULL)::int AS fechados_sem_responsavel,
        COUNT(*) FILTER (WHERE ${fechou} AND b.maintenance_cost IS NOT NULL)::int AS concluidos_com_custo,
        COUNT(*) FILTER (WHERE ${nasceu} AND b.priority = 'ALTA')::int AS altas,

        COUNT(*) FILTER (WHERE ${nasceu} AND a.voltas > 0)::int AS com_volta,
        COUNT(*) FILTER (WHERE ${nasceu} AND a.encaminhamentos > 1)::int AS reencaminhados
      FROM b
      LEFT JOIN LATERAL (
        SELECT MAX(tu.created_at) AS ultima_linha
        FROM ticket_updates tu
        WHERE tu.ticket_id = b.id
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE jsonb_exists(al.metadata, 'unforwarded_from')
               OR jsonb_exists(al.metadata, 'undone_by')
          ) AS voltas,
          COUNT(*) FILTER (WHERE jsonb_exists(al.metadata, 'forwarded_to')) AS encaminhamentos
        FROM audit_logs al
        WHERE al.entity = 'MaintenanceRecord' AND al.entity_id = b.id
      ) a ON true
    `;

    return rows[0];
  },

  /**
   * Cada responsável do prédio, lado a lado.
   *
   * Os verbos têm eixos diferentes e é de propósito: **recebeu** conta o aceite
   * dentro do período, **concluiu** conta o fechamento dentro do período, e
   * **em andamento** é agora. Um responsável que recebeu vinte em março e
   * fechou os vinte em abril não deve aparecer como ocioso em nenhum dos dois.
   *
   * `JOIN users`, e não `LEFT JOIN`: a linha sem responsável não é uma pessoa —
   * ela é o trabalho que ainda não foi encaminhado, e já está contado na
   * etapa de triagem do funil.
   */
  async porResponsavel(scope: AnalyticsScope, periodo: PeriodRange) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const atrasado = Prisma.raw(ATRASADO);
    const fechou = fechouEm(periodo);

    return prisma.$queryRaw<ResponsavelRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        u.id, u.name, u.avatar_url,
        COUNT(*) FILTER (
          WHERE b.received_at BETWEEN ${periodo.from_instant} AND ${periodo.to_instant}
        )::int AS recebidos,
        COUNT(*) FILTER (WHERE ${fechou})::int AS concluidos,
        COUNT(*) FILTER (
          WHERE b.closed_at IS NULL
            AND b.status IN ('EM_ANDAMENTO','AGUARDANDO_TERCEIRO','AGUARDANDO_FECHAMENTO')
        )::int AS em_andamento_agora,
        AVG(${consumidos}) FILTER (WHERE ${fechou})::float8 AS tempo_medio,
        COUNT(*) FILTER (WHERE ${fechou} AND ${atrasado})::int AS fechados_atrasados,
        COUNT(*) FILTER (WHERE b.closed_at IS NULL AND ${atrasado})::int AS abertos_atrasados,
        SUM(b.maintenance_cost) FILTER (WHERE ${fechou})::float8 AS custo
      FROM b
      JOIN users u ON u.id = b.responsible_id
      GROUP BY u.id, u.name, u.avatar_url
      ORDER BY u.name
    `;
  },

  /**
   * O ano mês a mês: quanto entrou e quanto saiu.
   *
   * É a leitura que nenhum número solto dá. "A fila cresceu 2" responde pelo
   * período inteiro; a série mensal mostra *quando* ela cresceu, e se a linha
   * de saída está alcançando a de entrada ou se afastando dela. Um prédio que
   * fecha 20 por mês e abre 25 tem um problema que a média do ano esconde.
   *
   * Um varrimento só, com as duas leituras empilhadas por `UNION ALL` e somadas
   * depois: são eixos diferentes (abertura pela vistoria, fechamento pelo
   * relógio local) e uma consulta para cada deixaria os filtros divergirem.
   */
  async evolucaoMensal(scope: AnalyticsScope, year: number) {
    return prisma.$queryRaw<MesRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        mes,
        SUM(abertos)::int AS abertos,
        SUM(fechados)::int AS fechados
      FROM (
        SELECT EXTRACT(MONTH FROM b.aberto_em)::int AS mes, 1 AS abertos, 0 AS fechados
        FROM b
        WHERE EXTRACT(YEAR FROM b.aberto_em) = ${year}

        UNION ALL

        SELECT EXTRACT(MONTH FROM (b.closed_at AT TIME ZONE ${Prisma.raw(TZ)}))::int, 0, 1
        FROM b
        WHERE b.closed_at IS NOT NULL
          AND EXTRACT(YEAR FROM (b.closed_at AT TIME ZONE ${Prisma.raw(TZ)})) = ${year}
      ) x
      GROUP BY mes
      ORDER BY mes
    `;
  },

  /**
   * Quem vistoria o prédio, e com que rigor.
   *
   * O responsável é medido pelo que resolve; o inspetor, pelo que encontra —
   * são trabalhos diferentes e nenhuma coluna serve para os dois. As perguntas
   * que este conjunto responde: quem está rodando o prédio, quanto dele cada um
   * cobre, e se alguém está passando rápido demais.
   *
   * `ocorrências por vistoria` e `vistorias sem ocorrência` são o par que
   * importa. Um inspetor que abre zero ocorrência em dez rondas ou tem um
   * prédio impecável ou não está olhando — e o gestor precisa saber qual dos
   * dois antes de confiar no verde da tela.
   *
   * A agregação é por vistoria primeiro e por pessoa depois. Somar direto sobre
   * o `JOIN` com as ocorrências multiplicaria cada vistoria pelo número de
   * ocorrências dela, e o tempo médio de ronda sairia errado.
   */
  async porInspetor(scope: AnalyticsScope, periodo: PeriodRange) {
    return prisma.$queryRaw<InspetorRow[]>`
      WITH vist AS (
        SELECT r.id, r.inspector_id, r.date,
               EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) / 60 AS minutos
        FROM inspection_reports r
        WHERE r.building_id = ${scope.building_id}
          AND r.inspector_id IS NOT NULL
          AND r.date BETWEEN ${periodo.from_day}::date AND ${periodo.to_day}::date
      ),
      por_vistoria AS (
        SELECT
          v.id, v.inspector_id, v.date, v.minutos,
          (SELECT COUNT(*) FROM floor_form_entries ffe WHERE ffe.report_id = v.id) AS andares,
          (SELECT COUNT(*)
             FROM maintenance_records mr
             JOIN floor_form_entries ffe ON ffe.id = mr.floor_form_entry_id
            WHERE ffe.report_id = v.id) AS ocorrencias,
          (SELECT COUNT(*)
             FROM maintenance_records mr
             JOIN floor_form_entries ffe ON ffe.id = mr.floor_form_entry_id
            WHERE ffe.report_id = v.id AND mr.priority = 'ALTA') AS altas
        FROM vist v
      )
      SELECT
        u.id, u.name, u.avatar_url,
        COUNT(*)::int AS vistorias,
        COUNT(DISTINCT p.date)::int AS dias,
        (SELECT COUNT(DISTINCT ffe.floor_id)
           FROM floor_form_entries ffe
           JOIN vist v2 ON v2.id = ffe.report_id
          WHERE v2.inspector_id = u.id)::int AS andares_distintos,
        SUM(p.ocorrencias)::int AS ocorrencias,
        SUM(p.altas)::int AS altas,
        AVG(p.minutos)::float8 AS minutos_medios,
        COUNT(*) FILTER (WHERE p.ocorrencias = 0)::int AS vistorias_sem_ocorrencia,
        MAX(p.date)::text AS ultima
      FROM por_vistoria p
      JOIN users u ON u.id = p.inspector_id
      GROUP BY u.id, u.name, u.avatar_url
      ORDER BY u.name
    `;
  },

  /** Quantos andares o prédio tem — o denominador da cobertura. */
  async totalDeAndares(buildingId: string) {
    const rows = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS total FROM floors WHERE building_id = ${buildingId}
    `;
    return rows[0]?.total ?? 0;
  },

  /**
   * Os que já estouraram e continuam abertos.
   *
   * Sem recorte de período, pelo mesmo motivo de `emRisco`: um chamado de dois
   * meses atrás que estourou o prazo é problema de hoje, e escondê-lo porque
   * nasceu fora do mês escolhido seria a tela ajudando a perder o prazo.
   */
  async atrasadosAbertos(scope: AnalyticsScope, limit = 20) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const limite = Prisma.raw(LIMITE);
    const atrasado = Prisma.raw(ATRASADO);

    return prisma.$queryRaw<EmRiscoRow[]>`
      WITH b AS (${base(scope)})
      SELECT
        b.id,
        b.priority::text AS priority,
        b.maintenance_type::text AS maintenance_type,
        b.description,
        f.label AS floor_label,
        u.name AS responsible,
        ${consumidos}::int AS dias,
        ${limite}::int AS limite
      FROM b
      LEFT JOIN floors f ON f.id = b.floor_id
      LEFT JOIN users u ON u.id = b.responsible_id
      WHERE b.closed_at IS NULL AND ${atrasado}
      ORDER BY (${consumidos} - ${limite}) DESC
      LIMIT ${limit}
    `;
  },
};
