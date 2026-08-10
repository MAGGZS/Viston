/**
 * Fuso do produto.
 *
 * O servidor roda em UTC (padrão do Render), mas o dia de uma vistoria é o dia
 * do calendário de quem vistoriou. Sem tratar isso, tudo enviado a partir das
 * 21h vira "amanhã": a coluna `date` é `@db.Date` e o Prisma grava o dia pelos
 * componentes UTC do instante, e o calendário agrupava com `toISOString()`.
 *
 * `APP_TIMEZONE` permite trocar o fuso sem alterar código.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

// en-CA formata como 'YYYY-MM-DD', que é a chave usada no calendário.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Dia do calendário local do instante, como 'YYYY-MM-DD'. */
export function zonedDayKey(date: Date): string {
  return dayFormatter.format(date);
}

/**
 * Deslocamento do fuso, em ms, naquele instante.
 * Calculado a partir do próprio Intl, então acompanha horário de verão sem
 * depender de tabela fixa.
 */
function offsetMs(date: Date): number {
  const parts = partsFormatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24, // meia-noite sai como "24" em alguns ICUs
    value('minute'),
    value('second')
  );

  // Os componentes só têm precisão de segundo — descartar os ms do instante.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** Instante UTC de uma data/hora do calendário local. */
export function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date {
  const guess = Date.UTC(year, monthIndex, day, hour, minute, second, millisecond);
  // Duas passadas: a primeira pode cair do lado errado de uma virada de offset.
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

/**
 * Dia do calendário local gravado como meia-noite UTC — formato que a coluna
 * `@db.Date` espera e que o front lê de volta pela string.
 */
export function zonedDateOnly(date: Date): Date {
  return new Date(`${zonedDayKey(date)}T00:00:00.000Z`);
}

/** Ano, mês (0-11) e dia do instante no calendário local. */
export function zonedParts(date: Date = new Date()) {
  const [year, month, day] = zonedDayKey(date).split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

/** Intervalo fechado [início, fim] de um período do calendário local. */
export function zonedRange(
  year: number,
  monthIndex: number,
  monthCount: number
): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(year, monthIndex, 1),
    end: new Date(zonedTimeToUtc(year, monthIndex + monthCount, 1).getTime() - 1),
  };
}
