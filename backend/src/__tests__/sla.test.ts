import {
  SLA_BUSINESS_DAYS,
  businessDaysBetween,
  computeSla,
  sqlBizIndex,
  sqlBusinessDaysBetween,
} from '../utils/sla';

/** A coluna `@db.Date` como o Prisma a entrega: meia-noite UTC do dia local. */
const dia = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Um instante qualquer do dia, no relógio de São Paulo (UTC-3). */
const instante = (key: string, hora = '12:00') =>
  new Date(`${key}T${hora}:00.000-03:00`);

/**
 * A mesma contagem, escrita do jeito burro: um dia de cada vez.
 *
 * Existe para conferir a fórmula fechada, que é a que roda em produção e a que
 * foi traduzida para SQL. Se as duas discordarem, é a fórmula que está errada.
 */
function contandoUmPorUm(startKey: string, endKey: string): number {
  const dias = [];
  const cursor = dia(startKey);
  const fim = dia(endKey);
  while (cursor < fim) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    dias.push(cursor.getUTCDay());
  }
  return dias.filter((d) => d !== 0 && d !== 6).length;
}

describe('businessDaysBetween', () => {
  it('não conta o próprio dia da abertura', () => {
    // 2026-09-14 é uma segunda-feira.
    expect(businessDaysBetween('2026-09-14', '2026-09-14')).toBe(0);
  });

  it('atravessa o fim de semana sem contá-lo', () => {
    // Sexta 11/09 → sábado, domingo, segunda.
    expect(businessDaysBetween('2026-09-11', '2026-09-12')).toBe(0); // sábado
    expect(businessDaysBetween('2026-09-11', '2026-09-13')).toBe(0); // domingo
    expect(businessDaysBetween('2026-09-11', '2026-09-14')).toBe(1); // segunda
  });

  it('conta uma semana cheia como cinco dias úteis', () => {
    expect(businessDaysBetween('2026-09-14', '2026-09-21')).toBe(5);
  });

  it('abre no sábado sem ganhar dia de brinde', () => {
    expect(businessDaysBetween('2026-09-12', '2026-09-14')).toBe(1);
  });

  it('nunca é negativo quando o fim vem antes do início', () => {
    expect(businessDaysBetween('2026-09-14', '2026-09-01')).toBe(0);
  });

  it('atravessa virada de mês e de ano', () => {
    expect(businessDaysBetween('2026-12-31', '2027-01-04')).toBe(2); // sex → seg
    expect(businessDaysBetween('2026-01-30', '2026-02-02')).toBe(1);
  });

  it('bate com a contagem dia a dia ao longo de oito anos', () => {
    const inicio = dia('2024-01-01');
    for (let i = 0; i < 3000; i += 7) {
      const de = new Date(inicio);
      de.setUTCDate(de.getUTCDate() + i);
      const ate = new Date(de);
      ate.setUTCDate(ate.getUTCDate() + (i % 37));

      const deKey = de.toISOString().slice(0, 10);
      const ateKey = ate.toISOString().slice(0, 10);
      expect(businessDaysBetween(deKey, ateKey)).toBe(contandoUmPorUm(deKey, ateKey));
    }
  });

  it('desconta o calendário de feriados quando houver um', () => {
    const feriados = { countBetween: () => 1 };
    expect(businessDaysBetween('2026-09-14', '2026-09-21', feriados)).toBe(4);
  });
});

describe('computeSla', () => {
  const HOJE = instante('2026-09-21'); // segunda

  it('dá cinco dias úteis à alta, dez à média e quinze à baixa', () => {
    expect(SLA_BUSINESS_DAYS).toEqual({ ALTA: 5, MEDIA: 10, BAIXA: 15 });
  });

  it('no limite exato ainda está no prazo', () => {
    // Segunda 14/09 + 5 dias úteis = segunda 21/09.
    const sla = computeSla({ priority: 'ALTA', openedOn: dia('2026-09-14'), closedAt: null, now: HOJE });

    expect(sla.dias).toBe(5);
    expect(sla.limite).toBe(5);
    expect(sla.consumo).toBe(1);
    expect(sla.restantes).toBe(0);
    expect(sla.atrasado).toBe(false);
  });

  it('um dia útil além do limite já é atraso', () => {
    const sla = computeSla({ priority: 'ALTA', openedOn: dia('2026-09-11'), closedAt: null, now: HOJE });

    expect(sla.dias).toBe(6);
    expect(sla.atrasado).toBe(true);
    expect(sla.restantes).toBe(-1);
  });

  it('marca risco a partir de 80% do prazo, e só enquanto está aberto', () => {
    // 4 de 5 dias úteis = 80%.
    const aberto = computeSla({ priority: 'ALTA', openedOn: dia('2026-09-15'), closedAt: null, now: HOJE });
    expect(aberto.consumo).toBeCloseTo(0.8);
    expect(aberto.em_risco).toBe(true);

    const fechado = computeSla({
      priority: 'ALTA',
      openedOn: dia('2026-09-15'),
      closedAt: instante('2026-09-21'),
      now: HOJE,
    });
    expect(fechado.em_risco).toBe(false);
    expect(fechado.congelado).toBe(true);
  });

  it('o relógio para no fechamento, e o atraso do histórico não se cura', () => {
    const fechadoNoPrazo = computeSla({
      priority: 'BAIXA',
      openedOn: dia('2026-01-05'),
      closedAt: instante('2026-01-09'),
      now: HOJE, // meses depois
    });
    expect(fechadoNoPrazo.dias).toBe(4);
    expect(fechadoNoPrazo.atrasado).toBe(false);

    const fechadoAtrasado = computeSla({
      priority: 'ALTA',
      openedOn: dia('2026-01-05'),
      closedAt: instante('2026-01-30'),
      now: HOJE,
    });
    expect(fechadoAtrasado.atrasado).toBe(true);
    expect(fechadoAtrasado.congelado).toBe(true);
  });

  it('fecha pelo dia do calendário local, não pelo dia UTC', () => {
    // 21h30 de 18/09 em São Paulo é 19/09 em UTC. O fechamento é do dia 18.
    const sla = computeSla({
      priority: 'ALTA',
      openedOn: dia('2026-09-14'),
      closedAt: new Date('2026-09-19T00:30:00.000Z'),
      now: HOJE,
    });
    expect(sla.dias).toBe(4);
  });

  it('sobrevive a chamado sem data de vistoria', () => {
    const sla = computeSla({ priority: 'MEDIA', openedOn: null, closedAt: null, now: HOJE });

    expect(sla.dias).toBeNull();
    expect(sla.restantes).toBeNull();
    expect(sla.atrasado).toBe(false);
    expect(sla.limite).toBe(10);
  });
});

describe('a tradução para SQL', () => {
  it('ancora na mesma segunda-feira que a fórmula em TypeScript', () => {
    expect(sqlBizIndex('r.date')).toContain("DATE '1969-12-29'");
    expect(sqlBizIndex('r.date')).toContain('LEAST');
  });

  it('põe piso em zero, como businessDaysBetween', () => {
    expect(sqlBusinessDaysBetween('a', 'b')).toMatch(/^GREATEST\(0,/);
  });

  it('desconta feriado pela CTE, na mesma janela aberta-fechada', () => {
    const sql = sqlBusinessDaysBetween('a', 'b');

    expect(sql).toContain('FROM feriados f');
    expect(sql).toContain('f.dia > (a)::date');
    expect(sql).toContain('f.dia <= (b)::date');
  });

  it('sem feriado, volta a ser a fórmula crua', () => {
    expect(sqlBusinessDaysBetween('a', 'b', { holidays: false })).not.toContain('feriados');
  });
});
