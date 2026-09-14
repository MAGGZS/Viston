import type { HolidayCalendar } from './sla';

/**
 * O calendário de feriados que o prazo desconta.
 *
 * `businessDaysBetween` sempre soube descontar feriado — a interface
 * `HolidayCalendar` está desenhada em utils/sla.ts desde que o prazo saiu do
 * navegador. O que faltava era alguém implementá-la, e enquanto faltou o
 * produto contou 25 de dezembro como dia de trabalho: um chamado de prioridade
 * alta aberto no dia 22 aparecia atrasado no dia 29, quando ninguém teve dia
 * para atendê-lo. O painel dizia "fora do prazo" sobre um atraso que o
 * calendário inventou.
 *
 * São os feriados nacionais, e só eles. Feriado municipal varia prédio a prédio
 * e entraria por outro caminho — uma lista por prédio, que ainda não existe.
 * Enquanto não existir, contar só o que vale no país inteiro erra menos do que
 * contar nada.
 *
 * Gerado, e não tabelado: uma lista escrita à mão precisa ser reescrita a cada
 * ano, e o ano em que ninguém reescrever é o ano em que o painel volta a errar
 * em silêncio. A Páscoa se calcula, e tudo o que se move anda com ela.
 */

const MS_PER_DAY = 86_400_000;

/** O dia do calendário de um número de dias desde 1970-01-01. */
function keyOf(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

/** O número de dias desde 1970-01-01 de um dia do calendário. */
function numberOf(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/**
 * O domingo de Páscoa do ano, pelo algoritmo de Meeus/Jones/Butcher.
 *
 * É aritmética inteira sobre o ano e nada mais — sem tabela, sem biblioteca, e
 * válido no calendário gregoriano inteiro. As letras são as do algoritmo
 * original de propósito: renomeá-las para algo "legível" só afastaria o código
 * da referência contra a qual ele se confere.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;

  const month = Math.floor(total / 31);
  const day = (total % 31) + 1;

  return keyOf(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Os feriados de data fixa.
 *
 * A Consciência Negra entrou na lista nacional pela Lei 14.759/2023 e vale a
 * partir de 2024 — anos anteriores não a têm, e datar o corte aqui é o que
 * mantém o histórico do painel coerente com o que de fato foi dia de trabalho.
 */
function fixos(year: number): string[] {
  const dias = [
    '01-01', // Confraternização Universal
    '04-21', // Tiradentes
    '05-01', // Dia do Trabalho
    '09-07', // Independência
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '12-25', // Natal
  ];

  if (year >= 2024) dias.push('11-20'); // Consciência Negra

  return dias.map((d) => `${year}-${d}`);
}

/**
 * Os feriados que andam com a Páscoa.
 *
 * Sexta-feira Santa é feriado por lei. Carnaval e Corpus Christi são, na letra,
 * ponto facultativo — mas manutenção predial não acontece em nenhum dos dois, e
 * cobrar prazo por um dia em que o prédio está fechado é cobrar prazo por um
 * dia que não existiu. O painel mede trabalho, não a letra do decreto.
 */
function moveis(year: number): string[] {
  const pascoa = numberOf(easterSunday(year));

  return [
    keyOf(pascoa - 48), // segunda de carnaval
    keyOf(pascoa - 47), // terça de carnaval
    keyOf(pascoa - 2), // sexta-feira santa
    keyOf(pascoa + 60), // corpus christi
  ];
}

const cache = new Map<number, string[]>();

/**
 * Todos os feriados do ano, em ordem, como 'YYYY-MM-DD'.
 *
 * Memoizado porque isto é consultado por chamado em listas inteiras, e o
 * resultado de um ano nunca muda.
 */
export function holidaysForYear(year: number): string[] {
  const guardado = cache.get(year);
  if (guardado) return guardado;

  const dias = [...fixos(year), ...moveis(year)].sort();
  cache.set(year, dias);
  return dias;
}

/**
 * Os feriados que caem de segunda a sexta, no intervalo de anos pedido.
 *
 * Feriado que cai no fim de semana já não era dia útil, e somá-lo ao desconto
 * tiraria do prazo um dia que a contagem nunca deu. É o erro clássico desta
 * conta, e a razão de o filtro estar aqui, uma vez, e não em cada uso.
 */
export function workdayHolidays(fromYear: number, toYear: number): string[] {
  const dias: string[] = [];

  for (let year = fromYear; year <= toYear; year += 1) {
    for (const key of holidaysForYear(year)) {
      const diaDaSemana = new Date(`${key}T00:00:00.000Z`).getUTCDay();
      if (diaDaSemana !== 0 && diaDaSemana !== 6) dias.push(key);
    }
  }

  return dias;
}

/**
 * O calendário como `businessDaysBetween` o consome.
 *
 * O intervalo é (início, fim] — aberto no começo e fechado no fim —, a mesma
 * janela que a contagem de dias úteis usa. Contar o dia da abertura aqui e não
 * lá faria o desconto e a contagem discordarem justamente no chamado aberto num
 * feriado.
 */
export const brazilHolidays: HolidayCalendar = {
  countBetween(startKey: string, endKey: string): number {
    const inicio = numberOf(startKey);
    const fim = numberOf(endKey);
    if (fim <= inicio) return 0;

    const deAno = Number(startKey.slice(0, 4));
    const ateAno = Number(endKey.slice(0, 4));

    return workdayHolidays(deAno, ateAno).filter((key) => {
      const n = numberOf(key);
      return n > inicio && n <= fim;
    }).length;
  },
};

/**
 * A janela de anos que o SQL carrega.
 *
 * O painel lê no máximo cinco anos para trás (`ANOS_ATRAS` da barra de filtros)
 * e o ano corrente; a folga para frente cobre o chamado aberto hoje cujo prazo
 * termina no ano que vem. Gerar séculos de feriado para ninguém consultar só
 * engorda o plano de consulta.
 */
export const SQL_HOLIDAY_WINDOW = { back: 8, forward: 2 };

/**
 * Os feriados como literal SQL, para virar CTE.
 *
 * Vai uma vez por consulta, num `WITH`, e não interpolado em cada uso da
 * fórmula: `sqlBusinessDaysBetween` aparece muitas vezes no mesmo SELECT, e
 * repetir uma lista de noventa datas em cada aparição produziria dezenas de
 * quilobytes de SQL para responder oito números.
 *
 * Só datas geradas aqui entram nesta string — nada que venha da requisição.
 */
export function sqlHolidayValues(hoje: Date = new Date()): string {
  const ano = hoje.getUTCFullYear();
  const dias = workdayHolidays(ano - SQL_HOLIDAY_WINDOW.back, ano + SQL_HOLIDAY_WINDOW.forward);

  return `ARRAY[${dias.map((d) => `'${d}'`).join(',')}]::date[]`;
}

/** O nome da CTE de feriados, partilhado entre quem a declara e quem a lê. */
export const HOLIDAY_CTE = 'feriados';

/** A declaração da CTE, para abrir o `WITH` das consultas do painel. */
export function sqlHolidayCte(hoje?: Date): string {
  return `${HOLIDAY_CTE} AS (SELECT unnest(${sqlHolidayValues(hoje)}) AS dia)`;
}
