import { MaintenanceCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sqlHolidayCte } from '../utils/holidays';
import { sqlBusinessDaysBetween, sqlSlaLimit } from '../utils/sla';
import { APP_TIMEZONE } from '../utils/timezone';

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

/**
 * A CTE de feriados, aberta em toda consulta do painel.
 *
 * Vai em todas, inclusive nas que não contam dias úteis: uma CTE não lida não
 * custa nada no plano, e a alternativa — lembrar caso a caso quais consultas
 * precisam dela — é como uma delas passa a contar o feriado como dia de
 * trabalho sem ninguém notar.
 *
 * Montada a cada consulta, e não uma vez no carregamento do módulo: a janela de
 * anos sai do relógio, e um processo que atravessasse a virada do ano ficaria
 * com uma lista velha.
 */
const feriados = () => Prisma.raw(sqlHolidayCte());

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

/**
 * O zero do funil: o instante em que a ocorrência entrou no sistema.
 *
 * Era a meia-noite do dia da vistoria, e por isso a primeira etapa só tinha
 * granularidade de dia — `r.date` é `@db.Date` e não guarda hora. O resultado
 * era uma etapa medida em múltiplos de 24h, que dizia "0,9 dia" tanto para
 * quem triou em vinte minutos quanto para quem triou na manhã seguinte.
 *
 * `floor_form_entries.completed_at` é o carimbo de quando o inspetor fechou
 * aquele andar — o instante real em que a ocorrência passou a existir, e o
 * primeiro momento em que o moderador poderia tê-la encaminhado. Sempre
 * preenchido (`@default(now())`), então não precisa de fallback.
 *
 * O prazo de SLA continua contando do dia da vistoria, e não daqui: são
 * relógios diferentes de propósito — o prazo é promessa ao prédio, o funil é
 * medida do processo.
 */
const ABERTURA_INSTANTE = `b.registrado_em`;

/** Horas entre dois carimbos, como número. */
function horas(de: string, ate: string) {
  return `EXTRACT(EPOCH FROM (${ate} - ${de})) / 3600.0`;
}

/**
 * O carimbo mais recente do chamado — a última vez que alguém mexeu nele.
 *
 * `GREATEST` sobre encaminhar, receber, concluir e a última linha da timeline:
 * são as quatro formas de mexer num chamado. Sem nenhuma delas, o último toque
 * é a própria vistoria que o abriu — e é daí que a conta parte, em vez de o
 * chamado nunca tocado aparecer como recém-mexido.
 *
 * Mora aqui, e não dentro de `saudeDoProcesso`, porque a fila acionável mede a
 * mesma coisa: duas cópias desta expressão é como o cartão "3 sem movimento" e
 * a lista de três chamados passam a discordar sobre quais são os três.
 *
 * Depende de um `LEFT JOIN LATERAL` chamado `t` com `ultima_linha` — ver
 * `SEM_MOVIMENTO_JOIN`.
 */
const ULTIMO_TOQUE = `GREATEST(
  ${ABERTURA_INSTANTE},
  COALESCE(b.forwarded_at, ${ABERTURA_INSTANTE}),
  COALESCE(b.received_at, ${ABERTURA_INSTANTE}),
  COALESCE(b.done_at, ${ABERTURA_INSTANTE}),
  COALESCE(t.ultima_linha, ${ABERTURA_INSTANTE})
)`;

/** O `JOIN` que `ULTIMO_TOQUE` exige. */
const SEM_MOVIMENTO_JOIN = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT MAX(tu.created_at) AS ultima_linha
    FROM ticket_updates tu
    WHERE tu.ticket_id = b.id
  ) t ON true
`;

/** Dias úteis desde o último toque. */
const DIAS_PARADO = sqlBusinessDaysBetween(
  `(${ULTIMO_TOQUE} AT TIME ZONE ${TZ})::date`,
  `(now() AT TIME ZONE ${TZ})::date`
);

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
      mr.responsible_id, mr.maintenance_cost, mr.description, mr.done_report,
      mr.forwarded_at, mr.received_at, mr.done_at, mr.closed_at,
      ffe.floor_id,
      r.origin::text AS origin,
      r.date AS aberto_em,
      ffe.completed_at AS registrado_em
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
  ciclo_p50: number | null;
  ciclo_p90: number | null;
  ciclo_p50_anterior: number | null;
  ciclo_p90_anterior: number | null;
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

/** Por que o chamado está na fila que pede ação hoje. */
export type MotivoDaFila = 'ATRASADO' | 'EM_RISCO' | 'PARADO';

export type FilaRow = EmRiscoRow & {
  motivo: MotivoDaFila;
  status: string;
  /** Dias úteis desde o último toque de alguém. */
  dias_parado: number;
};

export type FaixaRow = {
  faixa: string;
  n: number;
  n_atrasados: number;
};

export type ContagemDaFilaRow = {
  atrasados: number;
  em_risco: number;
  parados: number;
  em_aberto: number;
};

export type CustoRow = {
  total: number;
  total_anterior: number;
  fechados: number;
  n_com_custo: number;
  n_com_custo_anterior: number;
  ticket_medio: number | null;
  ticket_p50: number | null;
};

/** Uma quebra de custo. `dimensao` diz por qual eixo a linha foi agrupada. */
export type DimensaoRow = {
  dimensao: 'TIPO' | 'CATEGORIA' | 'ANDAR';
  chave: string | null;
  rotulo: string;
  n: number;
  n_com_custo: number;
  total: number;
};

export type PerfilRow = {
  mes: number;
  categoria: string;
  n: number;
};

export type RecorrenciaRow = {
  floor_id: string | null;
  floor_label: string;
  maintenance_type: string;
  n: number;
  custo: number;
  primeira_em: string;
  ultima_em: string;
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
  /** De que a carga concluída no período é feita, por prioridade. */
  altas: number;
  medias: number;
  baixas: number;
};

export type AtividadeResponsavelRow = {
  id: string;
  ticket_id: string;
  tipo: 'OPEN' | 'UPDATE' | 'RECEIVE' | 'DONE';
  quando: Date;
  maintenance_type: string;
  priority: string;
  floor_label: string;
  texto: string | null;
  photos: string[];
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
      WITH ${feriados()}, b AS (${base(scope)})
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

        -- Tempo de ciclo em percentis, e não em média: a distribuição é
        -- torta para a direita, e um chamado de seis meses num mês de doze
        -- levantava a média em semanas. O p50 é o que metade dos chamados
        -- cumpre; o p90 é a cauda que o prédio de fato sente.
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${consumidos})
          FILTER (WHERE ${fechouAtual}))::float8 AS ciclo_p50,
        (percentile_cont(0.9) WITHIN GROUP (ORDER BY ${consumidos})
          FILTER (WHERE ${fechouAtual}))::float8 AS ciclo_p90,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${consumidos})
          FILTER (WHERE ${fechouAnterior}))::float8 AS ciclo_p50_anterior,
        (percentile_cont(0.9) WITHIN GROUP (ORDER BY ${consumidos})
          FILTER (WHERE ${fechouAnterior}))::float8 AS ciclo_p90_anterior,

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
      WITH ${feriados()}, b AS (${base(scope)})
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
      WITH ${feriados()}, b AS (${base(scope)})
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
   * A fila que pede ação hoje — os três motivos, numa consulta.
   *
   * O painel tinha uma única lista acionável, `emRisco`, e ela vivia dentro do
   * bloco de SLA: dez chamados prestes a estourar, três blocos abaixo do topo,
   * numa tela que o moderador abre uma vez por mês. Tudo o mais era retrospecto.
   * Um painel sem superfície de ação é um relatório, e relatório se lê uma vez.
   *
   * Três motivos, porque são três decisões diferentes:
   *
   * - **ATRASADO** já estourou. Não há prazo a salvar; há conversa a ter.
   * - **EM_RISCO** consumiu 80% e ainda dá para salvar. É o único em que agir
   *   hoje muda o número de amanhã.
   * - **PARADO** pode estar dentro do prazo e mesmo assim esquecido: ninguém
   *   tocou nele em `diasSemMovimento` dias úteis. É o que some da vista
   *   justamente por não estar gritando.
   *
   * Nenhum recorta por período, pelo mesmo motivo de `emRisco`: um chamado de
   * dois meses atrás prestes a estourar é o que a tela precisa mostrar hoje, e
   * escondê-lo porque nasceu fora do mês escolhido seria a tela ajudando a
   * perder o prazo.
   *
   * Um chamado aparece num motivo só, na ordem acima — quem já estourou não é
   * listado de novo como parado. Contar a mesma pessoa duas vezes numa fila de
   * trabalho é como a fila deixa de bater com a realidade.
   */
  async filaAcionavel(scope: AnalyticsScope, diasSemMovimento: number, limit = 12) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const limite = Prisma.raw(LIMITE);
    const atrasado = Prisma.raw(ATRASADO);
    const parado = Prisma.raw(DIAS_PARADO);

    return prisma.$queryRaw<FilaRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT * FROM (
        SELECT
          b.id,
          CASE
            WHEN ${atrasado} THEN 'ATRASADO'
            WHEN ${consumidos} >= ${limite} * 0.8 THEN 'EM_RISCO'
            ELSE 'PARADO'
          END AS motivo,
          b.priority::text AS priority,
          b.status::text AS status,
          b.maintenance_type::text AS maintenance_type,
          b.description,
          f.label AS floor_label,
          u.name AS responsible,
          ${consumidos}::int AS dias,
          ${limite}::int AS limite,
          ${parado}::int AS dias_parado
        FROM b
        ${SEM_MOVIMENTO_JOIN}
        LEFT JOIN floors f ON f.id = b.floor_id
        LEFT JOIN users u ON u.id = b.responsible_id
        WHERE b.closed_at IS NULL
          AND (
            ${atrasado}
            OR ${consumidos} >= ${limite} * 0.8
            OR ${parado} >= ${diasSemMovimento}
          )
      ) x
      -- Dentro de cada motivo, o mais urgente primeiro: quem consumiu mais do
      -- prazo, e no empate a prioridade mais alta (ALTA < BAIXA no alfabeto).
      ORDER BY
        CASE motivo WHEN 'ATRASADO' THEN 0 WHEN 'EM_RISCO' THEN 1 ELSE 2 END,
        (dias::float8 / limite) DESC,
        priority ASC
      LIMIT ${limit * 3}
    `;
  },

  /**
   * Só quantos são — sem trazer os chamados.
   *
   * O painel inicial mostra "fora do prazo" num cartão e não lista nada; trazer
   * doze linhas com descrição, andar e responsável para exibir um número é
   * varredura paga e jogada fora.
   *
   * As expressões e a precedência são **as mesmas** de `filaAcionavel`, e é o
   * ponto inteiro deste método existir aqui em vez de uma contagem própria na
   * home: dois lugares definindo "atrasado" é como o cartão passa a dizer 3 e o
   * painel 2, e a partir daí nenhum dos dois tem crédito. Quem mudar o critério
   * mexe nas duas leituras de uma vez, porque elas leem as mesmas constantes.
   */
  async contagemDaFila(scope: AnalyticsScope, diasSemMovimento: number) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const limite = Prisma.raw(LIMITE);
    const atrasado = Prisma.raw(ATRASADO);
    const parado = Prisma.raw(DIAS_PARADO);

    const rows = await prisma.$queryRaw<ContagemDaFilaRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT
        COUNT(*) FILTER (WHERE ${atrasado})::int AS atrasados,
        COUNT(*) FILTER (
          WHERE NOT ${atrasado} AND ${consumidos} >= ${limite} * 0.8
        )::int AS em_risco,
        COUNT(*) FILTER (
          WHERE NOT ${atrasado}
            AND ${consumidos} < ${limite} * 0.8
            AND ${parado} >= ${diasSemMovimento}
        )::int AS parados,
        COUNT(*)::int AS em_aberto
      FROM b
      ${SEM_MOVIMENTO_JOIN}
      WHERE b.closed_at IS NULL
    `;

    return rows[0];
  },

  /**
   * A distribuição do tempo de resolução, em faixas.
   *
   * Dois percentis dizem onde estão o meio e a cauda; não dizem a forma. Um
   * prédio com p50 de 5 e p90 de 15 pode ter a massa toda em 5 com três
   * chamados perdidos lá atrás, ou uma rampa parelha de 5 a 15 — são problemas
   * diferentes e pedem ações diferentes, e os dois números são iguais nos dois.
   *
   * As faixas são de dias úteis e param nos limites de SLA do produto (5, 10,
   * 15) de propósito: assim cada barra se lê contra uma promessa, e não contra
   * um corte arbitrário. A última é aberta — "acima de 15" — porque a cauda não
   * tem fim e amarrá-la a um teto esconderia justamente quem está longe dele.
   */
  async distribuicaoDeCiclo(scope: AnalyticsScope, periodo: PeriodRange) {
    const consumidos = Prisma.raw(DIAS_CONSUMIDOS);
    const fechou = fechouEm(periodo);
    const atrasado = Prisma.raw(ATRASADO);

    return prisma.$queryRaw<FaixaRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT
        CASE
          WHEN ${consumidos} <= 1 THEN '0-1'
          WHEN ${consumidos} <= 2 THEN '2'
          WHEN ${consumidos} <= 3 THEN '3'
          WHEN ${consumidos} <= 5 THEN '4-5'
          WHEN ${consumidos} <= 7 THEN '6-7'
          WHEN ${consumidos} <= 10 THEN '8-10'
          WHEN ${consumidos} <= 15 THEN '11-15'
          ELSE '15+'
        END AS faixa,
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE ${atrasado})::int AS n_atrasados
      FROM b
      WHERE ${fechou}
      GROUP BY faixa
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

    // `ULTIMO_TOQUE` e `DIAS_PARADO` moram no topo do arquivo: a fila acionável
    // lista exatamente os chamados que este número conta, e duas cópias da
    // expressão é como o cartão e a lista passam a discordar.
    const diasParado = Prisma.raw(DIAS_PARADO);

    const rows = await prisma.$queryRaw<ProcessoRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
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
      ${SEM_MOVIMENTO_JOIN}
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
      WITH ${feriados()}, b AS (${base(scope)})
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
        SUM(b.maintenance_cost) FILTER (WHERE ${fechou})::float8 AS custo,

        -- De que a carga de cada um é feita.
        --
        -- Sem isto a tabela compara "taxa de atraso" entre pessoas que não
        -- receberam o mesmo trabalho: quem pega os de prioridade alta tem cinco
        -- dias úteis de prazo, quem pega os baixos tem quinze, e o primeiro
        -- aparece pior fazendo o serviço mais difícil. A coluna existe para a
        -- comparação ser possível, não para decorar.
        COUNT(*) FILTER (WHERE ${fechou} AND b.priority = 'ALTA')::int AS altas,
        COUNT(*) FILTER (WHERE ${fechou} AND b.priority = 'MEDIA')::int AS medias,
        COUNT(*) FILTER (WHERE ${fechou} AND b.priority = 'BAIXA')::int AS baixas
      FROM b
      JOIN users u ON u.id = b.responsible_id
      GROUP BY u.id, u.name, u.avatar_url
      ORDER BY u.name
    `;
  },

  /**
   * O custo da manutenção, e a honestidade dele.
   *
   * `maintenance_cost` está no banco desde sempre e não estava em lugar nenhum
   * do painel. O painel sabia dizer que quarenta chamados fecharam e não sabia
   * dizer quanto custaram — que é a pergunta de quem paga a manutenção, e a
   * única que justifica um sistema de vistoria existir para além da equipe que
   * o opera.
   *
   * `n_com_custo` contra `fechados` vem junto do total, e não como nota de
   * rodapé: um total que cobre um terço dos chamados apresentado como total é
   * pior do que não ter número nenhum. A tela degrada o bloco quando a
   * cobertura é baixa, e é este par que ela lê.
   *
   * Eixo do fechamento, como o tempo de resolução: o custo é do mês em que o
   * serviço terminou, não do mês em que a vistoria o encontrou.
   */
  async custo(scope: AnalyticsScope, atual: PeriodRange, anterior: PeriodRange) {
    const fechou = fechouEm(atual);
    const fechouAnterior = fechouEm(anterior);

    const rows = await prisma.$queryRaw<CustoRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT
        COALESCE(SUM(b.maintenance_cost) FILTER (WHERE ${fechou}), 0)::float8 AS total,
        COALESCE(SUM(b.maintenance_cost) FILTER (WHERE ${fechouAnterior}), 0)::float8 AS total_anterior,
        COUNT(*) FILTER (WHERE ${fechou})::int AS fechados,
        COUNT(*) FILTER (WHERE ${fechou} AND b.maintenance_cost IS NOT NULL)::int AS n_com_custo,
        COUNT(*) FILTER (WHERE ${fechouAnterior} AND b.maintenance_cost IS NOT NULL)::int
          AS n_com_custo_anterior,
        AVG(b.maintenance_cost) FILTER (WHERE ${fechou})::float8 AS ticket_medio,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY b.maintenance_cost)
          FILTER (WHERE ${fechou}))::float8 AS ticket_p50
      FROM b
    `;

    return rows[0];
  },

  /**
   * Onde o dinheiro foi: por tipo de manutenção e por andar.
   *
   * Duas quebras numa consulta, com a dimensão nomeada numa coluna. Duas
   * consultas com o mesmo `WHERE` escrito duas vezes é onde um filtro esquecido
   * faz o total por tipo discordar do total por andar na mesma tela.
   *
   * O andar traz o rótulo por `JOIN floors`: a CTE tem o `floor_id`, e devolver
   * o id cru obrigaria a tela a cruzar com a lista de andares para desenhar uma
   * barra.
   */
  async custoPorDimensao(scope: AnalyticsScope, periodo: PeriodRange) {
    const fechou = fechouEm(periodo);

    return prisma.$queryRaw<DimensaoRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT 'TIPO' AS dimensao,
             b.maintenance_type::text AS chave,
             b.maintenance_type::text AS rotulo,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE b.maintenance_cost IS NOT NULL)::int AS n_com_custo,
             COALESCE(SUM(b.maintenance_cost), 0)::float8 AS total
      FROM b
      WHERE ${fechou}
      GROUP BY b.maintenance_type

      UNION ALL

      SELECT 'CATEGORIA', b.category::text, b.category::text,
             COUNT(*)::int,
             COUNT(*) FILTER (WHERE b.maintenance_cost IS NOT NULL)::int,
             COALESCE(SUM(b.maintenance_cost), 0)::float8
      FROM b
      WHERE ${fechou}
      GROUP BY b.category

      UNION ALL

      SELECT 'ANDAR', b.floor_id::text, COALESCE(f.label, 'sem andar'),
             COUNT(*)::int,
             COUNT(*) FILTER (WHERE b.maintenance_cost IS NOT NULL)::int,
             COALESCE(SUM(b.maintenance_cost), 0)::float8
      FROM b
      LEFT JOIN floors f ON f.id = b.floor_id
      WHERE ${fechou}
      GROUP BY b.floor_id, f.label

      ORDER BY total DESC, n DESC
    `;
  },

  /**
   * O perfil da manutenção mês a mês: corretiva contra preventiva.
   *
   * É a métrica de maturidade do prédio, e ela estava no banco desde o começo —
   * `MaintenanceCategory` era um chip de filtro e nunca uma dimensão. Corretiva
   * subindo ao longo do ano é um prédio apagando incêndio; preventiva subindo é
   * um prédio que passou a se antecipar. Nenhum número solto diz isso: é a
   * proporção ao longo do tempo.
   *
   * Eixo da abertura, e não do fechamento: a categoria descreve por que a
   * ocorrência nasceu, e atribuí-la ao mês em que alguém a fechou perderia
   * justamente a leitura de quando o prédio começou a quebrar mais.
   */
  async perfilMensal(scope: AnalyticsScope, year: number) {
    return prisma.$queryRaw<PerfilRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT
        EXTRACT(MONTH FROM b.aberto_em)::int AS mes,
        b.category::text AS categoria,
        COUNT(*)::int AS n
      FROM b
      WHERE EXTRACT(YEAR FROM b.aberto_em) = ${year}
      GROUP BY mes, b.category
      ORDER BY mes
    `;
  },

  /**
   * O que reincide: andar cruzado com tipo de manutenção.
   *
   * A pergunta é cruzada por natureza — nem a lista de andares nem a de tipos
   * responde sozinha. "O sétimo andar teve infiltração cinco vezes em seis
   * meses" é a frase que decide parar de remendar e fazer a obra, e ela precisa
   * das duas dimensões ao mesmo tempo.
   *
   * Eixo da abertura: reincidência é sobre quantas vezes o problema *apareceu*.
   * Contar pelo fechamento faria três ocorrências fechadas no mesmo mês
   * parecerem um surto daquele mês.
   *
   * `ultima_em` vem junto porque "cinco vezes" e "cinco vezes, a última em
   * agosto" são informações diferentes: a segunda diz se ainda está acontecendo.
   */
  async recorrencia(scope: AnalyticsScope, periodo: PeriodRange) {
    const nasceu = nasceuEm(periodo);

    return prisma.$queryRaw<RecorrenciaRow[]>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT
        b.floor_id,
        COALESCE(f.label, 'sem andar') AS floor_label,
        b.maintenance_type::text AS maintenance_type,
        COUNT(*)::int AS n,
        COALESCE(SUM(b.maintenance_cost), 0)::float8 AS custo,
        MIN(b.aberto_em)::text AS primeira_em,
        MAX(b.aberto_em)::text AS ultima_em
      FROM b
      LEFT JOIN floors f ON f.id = b.floor_id
      WHERE ${nasceu}
      GROUP BY b.floor_id, f.label, b.maintenance_type
      ORDER BY n DESC, custo DESC
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
      WITH ${feriados()}, b AS (${base(scope)})
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
   * O que já estava em aberto no primeiro dia do ano.
   *
   * A série mensal só conta o que nasceu e o que fechou dentro do ano, então a
   * soma corrida dela começa em zero — e uma linha de fila acumulada que começa
   * em zero diz que o prédio entrou em janeiro sem nada pendente, o que quase
   * nunca é verdade. Este número é o degrau de onde a linha parte.
   *
   * "Em aberto naquele dia" é nascido antes e ainda não fechado até ali: o
   * chamado fechado em março conta como aberto em janeiro, porque em janeiro
   * ele estava.
   */
  async backlogNoInicioDoAno(scope: AnalyticsScope, year: number) {
    const primeiroDia = `${year}-01-01`;

    const rows = await prisma.$queryRaw<Array<{ saldo_inicial: number }>>`
      WITH ${feriados()}, b AS (${base(scope)})
      SELECT COUNT(*)::int AS saldo_inicial
      FROM b
      WHERE b.aberto_em < ${primeiroDia}::date
        AND (
          b.closed_at IS NULL
          OR (b.closed_at AT TIME ZONE ${Prisma.raw(TZ)})::date >= ${primeiroDia}::date
        )
    `;

    return rows[0]?.saldo_inicial ?? 0;
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
          AND r.origin = 'VISTORIA'::"ReportOrigin"
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
      WITH ${feriados()}, b AS (${base(scope)})
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

  /**
   * As atividades dos últimos 7 dias de um responsável no prédio.
   *
   * Traz os quatro eventos da pessoa ordenados pelo relógio:
   * 1. Ocorrência aberta por ela (origin = 'AVULSA')
   * 2. Anotação na Linha do Tempo (ticket_updates de autoria dela)
   * 3. Chamado recebido (received_at)
   * 4. Conclusão informada (done_at)
   */
  async atividadesRecentesResponsavel(scope: AnalyticsScope, limit = 20) {
    if (!scope.responsible_id) return [];

    return prisma.$queryRaw<AtividadeResponsavelRow[]>`
      WITH b AS (${base(scope)})
      SELECT * FROM (
        -- 1. Ocorrência aberta pelo próprio responsável
        SELECT
          b.id,
          b.id AS ticket_id,
          'OPEN' AS tipo,
          b.registrado_em AS quando,
          b.maintenance_type::text AS maintenance_type,
          b.priority::text AS priority,
          COALESCE(f.label, 'Sem andar') AS floor_label,
          b.description AS texto,
          ARRAY[]::text[] AS photos
        FROM b
        LEFT JOIN floors f ON f.id = b.floor_id
        WHERE b.origin = 'AVULSA'
          AND b.registrado_em >= (now() - interval '7 days')

        UNION ALL

        -- 2. Anotação na Linha do Tempo
        SELECT
          tu.id,
          tu.ticket_id,
          'UPDATE' AS tipo,
          tu.created_at AS quando,
          b.maintenance_type::text AS maintenance_type,
          b.priority::text AS priority,
          COALESCE(f.label, 'Sem andar') AS floor_label,
          tu.description AS texto,
          tu.photos
        FROM ticket_updates tu
        JOIN b ON b.id = tu.ticket_id
        LEFT JOIN floors f ON f.id = b.floor_id
        WHERE tu.author_id = ${scope.responsible_id}
          AND tu.created_at >= (now() - interval '7 days')

        UNION ALL

        -- 3. Chamado recebido (aceite de chamado de vistoria ou moderador)
        SELECT
          b.id,
          b.id AS ticket_id,
          'RECEIVE' AS tipo,
          b.received_at AS quando,
          b.maintenance_type::text AS maintenance_type,
          b.priority::text AS priority,
          COALESCE(f.label, 'Sem andar') AS floor_label,
          b.description AS texto,
          ARRAY[]::text[] AS photos
        FROM b
        LEFT JOIN floors f ON f.id = b.floor_id
        WHERE b.origin != 'AVULSA'
          AND b.received_at >= (now() - interval '7 days')

        UNION ALL

        -- 4. Conclusão informada
        SELECT
          b.id,
          b.id AS ticket_id,
          'DONE' AS tipo,
          b.done_at AS quando,
          b.maintenance_type::text AS maintenance_type,
          b.priority::text AS priority,
          COALESCE(f.label, 'Sem andar') AS floor_label,
          COALESCE(b.done_report, b.description) AS texto,
          ARRAY[]::text[] AS photos
        FROM b
        LEFT JOIN floors f ON f.id = b.floor_id
        WHERE b.done_at >= (now() - interval '7 days')
      ) x
      ORDER BY quando DESC
      LIMIT ${limit}
    `;
  },
};
