import {
  brazilHolidays,
  easterSunday,
  holidaysForYear,
  sqlHolidayCte,
  workdayHolidays,
} from '../utils/holidays';
import { businessDaysBetween, computeSla } from '../utils/sla';

/** A coluna `@db.Date` como o Prisma a entrega: meia-noite UTC do dia local. */
const dia = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Um instante qualquer do dia, no relógio de São Paulo (UTC-3). */
const instante = (key: string, hora = '12:00') => new Date(`${key}T${hora}:00.000-03:00`);

describe('easterSunday', () => {
  /**
   * Domingos de Páscoa conferidos contra o calendário litúrgico. Cobrem março e
   * abril, ano bissexto e virada de século — os três lugares onde a aritmética
   * de Meeus costuma escorregar.
   */
  it.each([
    [2020, '2020-04-12'],
    [2021, '2021-04-04'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
    [2038, '2038-04-25'],
  ])('acerta a Páscoa de %i', (ano, esperado) => {
    expect(easterSunday(ano)).toBe(esperado);
  });

  it('cai sempre num domingo', () => {
    for (let ano = 2000; ano <= 2060; ano += 1) {
      expect(new Date(`${easterSunday(ano)}T00:00:00.000Z`).getUTCDay()).toBe(0);
    }
  });
});

describe('holidaysForYear', () => {
  it('põe os móveis de 2026 onde a Páscoa os deixa', () => {
    const dias = holidaysForYear(2026);

    // Páscoa 05/04/2026.
    expect(dias).toContain('2026-02-16'); // segunda de carnaval
    expect(dias).toContain('2026-02-17'); // terça de carnaval
    expect(dias).toContain('2026-04-03'); // sexta-feira santa
    expect(dias).toContain('2026-06-04'); // corpus christi
  });

  it('traz os oito fixos de sempre', () => {
    const dias = holidaysForYear(2026);

    for (const d of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']) {
      expect(dias).toContain(`2026-${d}`);
    }
  });

  it('só tem Consciência Negra a partir de 2024', () => {
    expect(holidaysForYear(2023)).not.toContain('2023-11-20');
    expect(holidaysForYear(2024)).toContain('2024-11-20');
    expect(holidaysForYear(2026)).toContain('2026-11-20');
  });

  it('sai em ordem e sem repetição', () => {
    for (let ano = 2020; ano <= 2035; ano += 1) {
      const dias = holidaysForYear(ano);
      expect([...dias].sort()).toEqual(dias);
      expect(new Set(dias).size).toBe(dias.length);
    }
  });
});

describe('workdayHolidays', () => {
  it('descarta o feriado que cai no fim de semana', () => {
    // 01/05/2027 é um sábado; 25/12/2027, um sábado também.
    const dias = workdayHolidays(2027, 2027);

    expect(dias).not.toContain('2027-05-01');
    expect(dias).not.toContain('2027-12-25');
    expect(dias).toContain('2027-04-21'); // quarta
  });

  it('nunca devolve sábado nem domingo', () => {
    for (const key of workdayHolidays(2020, 2040)) {
      const diaDaSemana = new Date(`${key}T00:00:00.000Z`).getUTCDay();
      expect(diaDaSemana).not.toBe(0);
      expect(diaDaSemana).not.toBe(6);
    }
  });
});

describe('brazilHolidays.countBetween', () => {
  it('conta a janela aberta no começo e fechada no fim', () => {
    // 25/12/2026 é uma sexta.
    expect(brazilHolidays.countBetween('2026-12-25', '2026-12-31')).toBe(0);
    expect(brazilHolidays.countBetween('2026-12-24', '2026-12-25')).toBe(1);
  });

  it('não conta feriado de fim de semana', () => {
    // 01/05/2027 é sábado.
    expect(brazilHolidays.countBetween('2027-04-28', '2027-05-05')).toBe(0);
  });

  it('atravessa a virada de ano', () => {
    // 25/12/2026 (sexta) e 01/01/2027 (sexta).
    expect(brazilHolidays.countBetween('2026-12-24', '2027-01-04')).toBe(2);
  });

  it('é zero quando o fim vem antes do início', () => {
    expect(brazilHolidays.countBetween('2026-12-31', '2026-12-01')).toBe(0);
  });
});

describe('o prazo com feriado', () => {
  /**
   * O caso que motivou tudo isto: a semana do Natal.
   *
   * 21/12/2026 é uma segunda e 25/12 é a sexta daquela mesma semana. Sem
   * calendário, a semana inteira conta cinco dias úteis e um chamado de
   * prioridade alta aberto no dia 21 aparece no limite do prazo no dia 28. Com
   * calendário, o Natal sai da conta e ele ainda tem um dia.
   */
  it('não cobra o dia de Natal de quem não teve o dia', () => {
    expect(businessDaysBetween('2026-12-21', '2026-12-28')).toBe(5);
    expect(businessDaysBetween('2026-12-21', '2026-12-28', brazilHolidays)).toBe(4);
  });

  it('computeSla usa o calendário nacional sem que ninguém precise passá-lo', () => {
    const sla = computeSla({
      priority: 'ALTA',
      openedOn: dia('2026-12-21'),
      closedAt: null,
      now: instante('2026-12-28'),
    });

    expect(sla.dias).toBe(4);
    expect(sla.atrasado).toBe(false);
    expect(sla.restantes).toBe(1);
  });

  it('sem o calendário, o mesmo chamado chega ao limite', () => {
    const sla = computeSla({
      priority: 'ALTA',
      openedOn: dia('2026-12-21'),
      closedAt: null,
      now: instante('2026-12-28'),
      holidays: null,
    });

    expect(sla.dias).toBe(5);
    expect(sla.restantes).toBe(0);
  });

  it('o carnaval também sai da conta', () => {
    // Segunda 16/02 e terça 17/02 de 2026 são carnaval.
    expect(businessDaysBetween('2026-02-13', '2026-02-20')).toBe(5);
    expect(businessDaysBetween('2026-02-13', '2026-02-20', brazilHolidays)).toBe(3);
  });

  it('feriado de sábado não desconta duas vezes', () => {
    // 01/05/2027 é sábado: a semana já não o contava.
    expect(businessDaysBetween('2027-04-26', '2027-05-03')).toBe(5);
    expect(businessDaysBetween('2027-04-26', '2027-05-03', brazilHolidays)).toBe(5);
  });
});

describe('a tradução para SQL', () => {
  it('declara a CTE que a fórmula lê', () => {
    const cte = sqlHolidayCte(new Date('2026-09-13T00:00:00.000Z'));

    expect(cte).toMatch(/^feriados AS \(SELECT unnest\(ARRAY\[/);
    expect(cte).toContain('::date[]) AS dia)');
  });

  it('carrega a mesma lista que o TypeScript desconta', () => {
    const hoje = new Date('2026-09-13T00:00:00.000Z');
    const cte = sqlHolidayCte(hoje);

    for (const key of workdayHolidays(2018, 2028)) {
      expect(cte).toContain(`'${key}'`);
    }
  });

  it('não carrega feriado de fim de semana para o banco', () => {
    const cte = sqlHolidayCte(new Date('2026-09-13T00:00:00.000Z'));

    expect(cte).not.toContain("'2027-05-01'"); // sábado
    expect(cte).not.toContain("'2027-12-25'"); // sábado
  });
});
