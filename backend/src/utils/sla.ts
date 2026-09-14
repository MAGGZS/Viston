import { Priority } from '@prisma/client';
import { HOLIDAY_CTE, brazilHolidays } from './holidays';
import { zonedDayKey } from './timezone';

/**
 * O prazo de cada chamado, e o único lugar onde ele é decidido.
 *
 * Antes disto o prazo vivia no navegador, dentro da tela da fila de novos: nem
 * o backend nem o restante do produto sabiam o que era estar atrasado. Isso
 * bastava enquanto o número só ordenava a fila; não basta a partir do momento
 * em que um painel passa a dizer "74% dentro do SLA", porque dois cálculos
 * separados acabam divergindo e um painel que discorda do cartão não é
 * consultado duas vezes.
 *
 * Então o cálculo mora aqui, no servidor, e desce pronto para a tela. As
 * agregações do painel não chamam `computeSla` linha a linha — elas rodam a
 * mesma fórmula dentro do SQL, via `sqlBizIndex`, que está escrita logo abaixo
 * justamente para poder ser conferida contra a de cima de relance.
 */

/** Dias úteis que cada prioridade tem antes de a espera virar atraso. */
export const SLA_BUSINESS_DAYS: Record<Priority, number> = {
  ALTA: 5,
  MEDIA: 10,
  BAIXA: 15,
};

/** A partir de quanto do prazo consumido um chamado ainda aberto vira risco. */
export const SLA_RISK_THRESHOLD = 0.8;

/**
 * Por onde os feriados entram.
 *
 * A interface é o contrato, e `brazilHolidays` (utils/holidays.ts) é quem o
 * cumpre hoje: os feriados nacionais, gerados a partir do ano. Feriado
 * municipal, quando existir, entra por aqui também — outra implementação, e
 * nada mais muda.
 */
export interface HolidayCalendar {
  /** Quantos feriados úteis caem no intervalo (início, fim]. */
  countBetween(startKey: string, endKey: string): number;
}

const MS_PER_DAY = 86_400_000;

/**
 * A segunda-feira de onde se conta.
 *
 * 1969-12-29 foi uma segunda. Ancorar a contagem nela faz o resto da fórmula
 * ser uma divisão por 7 sem nenhum ajuste de dia da semana — e é a mesma
 * âncora usada no SQL, o que permite conferir os dois lados com a mesma conta.
 */
const MONDAY_EPOCH_DAY = -3;

/** O dia do calendário como número inteiro de dias desde 1970-01-01. */
function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * Quantos dias úteis existem de 1969-12-29 até `n`, contando o próprio `n`.
 *
 * A diferença entre dois índices destes é a contagem de dias úteis do
 * intervalo — sem laço, o que importa porque isto roda por chamado em listas
 * inteiras e, do outro lado, dentro de um SELECT.
 */
function businessDayIndex(n: number): number {
  const k = n - MONDAY_EPOCH_DAY;
  const weeks = Math.floor(k / 7);
  const rest = k - weeks * 7; // sempre 0..6, inclusive para k negativo
  return weeks * 5 + Math.min(rest + 1, 5);
}

/**
 * Dias úteis decorridos entre dois dias do calendário, no formato 'YYYY-MM-DD'.
 *
 * Conta o dia final e não o inicial: um chamado aberto hoje tem zero dias
 * úteis decorridos, que é a mesma leitura que a fila sempre teve. Sexta para
 * segunda dá 1; sexta para sábado dá 0.
 */
export function businessDaysBetween(
  startKey: string,
  endKey: string,
  holidays?: HolidayCalendar
): number {
  const start = dayNumber(startKey);
  const end = dayNumber(endKey);
  if (end <= start) return 0;

  const uteis = businessDayIndex(end) - businessDayIndex(start);
  return Math.max(0, uteis - (holidays?.countBetween(startKey, endKey) ?? 0));
}

/**
 * O dia do calendário de uma coluna `@db.Date`.
 *
 * Colunas de data chegam do Prisma como meia-noite UTC do dia que guardam —
 * o dia já é local, não há fuso a converter, e converter aqui é justamente o
 * que jogaria a vistoria do dia 31 para o dia 30.
 */
function dateColumnKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** O prazo de um chamado, como as telas e o painel o leem. */
export type SlaInfo = {
  /** Dias úteis do prazo da prioridade. */
  limite: number;
  /** Dias úteis decorridos. `null` quando o chamado não tem data de vistoria. */
  dias: number | null;
  /** `dias / limite`, sem teto — é ele que ordena a fila. */
  consumo: number;
  /** Quantos dias úteis ainda cabem. Negativo quando já estourou. */
  restantes: number | null;
  /** Passou do prazo. Vale para sempre: um concluído fora do prazo não se cura. */
  atrasado: boolean;
  /** Ainda aberto e já consumiu 80% do prazo. */
  em_risco: boolean;
  /** O relógio parou porque o chamado foi fechado. */
  congelado: boolean;
};

const SEM_DATA: Omit<SlaInfo, 'limite'> = {
  dias: null,
  consumo: 0,
  restantes: null,
  atrasado: false,
  em_risco: false,
  congelado: false,
};

/**
 * O prazo de um chamado.
 *
 * O relógio começa no dia da vistoria que abriu a ocorrência — não no instante
 * em que o aparelho sincronizou — e corre sem pausa, inclusive enquanto o
 * chamado espera o responsável clicar em "Receber": essa espera é espera de
 * verdade, e descontá-la esconderia exatamente o gargalo que o painel existe
 * para mostrar. Para quando o moderador fecha.
 */
export function computeSla(input: {
  priority: Priority;
  /** `report.date`, a coluna `@db.Date` da vistoria. */
  openedOn: Date | null | undefined;
  closedAt: Date | null | undefined;
  /** Agora. Existe para os testes; em produção é sempre o relógio do servidor. */
  now?: Date;
  /**
   * O calendário de feriados. Omitido, é o nacional — quem chama não precisa
   * lembrar de passá-lo, e esquecer de passar era como o produto inteiro
   * voltava a contar 25 de dezembro como dia de trabalho. `null` conta só
   * sábado e domingo, e existe para os testes da fórmula crua.
   */
  holidays?: HolidayCalendar | null;
}): SlaInfo {
  const limite = SLA_BUSINESS_DAYS[input.priority];
  if (!input.openedOn) return { limite, ...SEM_DATA };

  const congelado = Boolean(input.closedAt);
  const fim = input.closedAt
    ? zonedDayKey(input.closedAt)
    : zonedDayKey(input.now ?? new Date());

  const calendario = input.holidays === undefined ? brazilHolidays : input.holidays;
  const dias = businessDaysBetween(dateColumnKey(input.openedOn), fim, calendario ?? undefined);
  const consumo = dias / limite;
  const atrasado = dias > limite;

  return {
    limite,
    dias,
    consumo,
    restantes: limite - dias,
    atrasado,
    em_risco: !congelado && !atrasado && consumo >= SLA_RISK_THRESHOLD,
    congelado,
  };
}

/**
 * A mesma contagem de dias úteis, em SQL.
 *
 * O painel agrega milhares de linhas por consulta e trazê-las para somar em
 * JavaScript seria o erro que o projeto pediu para não cometer. Então a
 * fórmula existe duas vezes, de propósito e lado a lado — `businessDayIndex`
 * acima e esta aqui —, com um teste que compara as duas leituras.
 *
 * `dateExpr` é interpolado no SQL: só aceita expressão escrita por nós, nunca
 * valor vindo da requisição.
 */
export function sqlBizIndex(dateExpr: string): string {
  const k = `((${dateExpr})::date - DATE '1969-12-29')`;
  return `(FLOOR(${k}::numeric / 7) * 5 + LEAST(MOD(${k}, 7) + 1, 5))`;
}

/**
 * O desconto de feriados, em SQL.
 *
 * Lê a CTE `feriados`, que quem monta a consulta declara uma vez no `WITH` (ver
 * `sqlHolidayCte`). A janela é (início, fim], a mesma de `businessDaysBetween`,
 * e a lista já vem sem feriado de fim de semana — descontar um sábado seria
 * tirar do prazo um dia que a contagem nunca deu.
 */
function sqlHolidayDiscount(startExpr: string, endExpr: string): string {
  return `(SELECT count(*) FROM ${HOLIDAY_CTE} f
    WHERE f.dia > (${startExpr})::date AND f.dia <= (${endExpr})::date)`;
}

/**
 * Dias úteis decorridos entre duas expressões de data, em SQL.
 *
 * Espelha `businessDaysBetween`, inclusive o piso em zero e o desconto de
 * feriados. `holidays: false` devolve a fórmula crua — sábado e domingo apenas
 * —, e serve a quem monta um SELECT sem a CTE `feriados` no `WITH`.
 */
export function sqlBusinessDaysBetween(
  startExpr: string,
  endExpr: string,
  options: { holidays?: boolean } = {}
): string {
  const uteis = `${sqlBizIndex(endExpr)} - ${sqlBizIndex(startExpr)}`;
  const comFeriado = options.holidays !== false;

  return comFeriado
    ? `GREATEST(0, ${uteis} - ${sqlHolidayDiscount(startExpr, endExpr)})`
    : `GREATEST(0, ${uteis})`;
}

/** O prazo de cada prioridade, como expressão SQL (para comparar com o decorrido). */
export function sqlSlaLimit(priorityExpr: string): string {
  return `(CASE ${priorityExpr}
    WHEN 'ALTA' THEN ${SLA_BUSINESS_DAYS.ALTA}
    WHEN 'MEDIA' THEN ${SLA_BUSINESS_DAYS.MEDIA}
    WHEN 'BAIXA' THEN ${SLA_BUSINESS_DAYS.BAIXA}
  END)`;
}
