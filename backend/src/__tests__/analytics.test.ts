import { previousPeriod, resolvePeriod } from '../services/analytics.service';

/**
 * O período do painel.
 *
 * Duas leituras do mesmo intervalo convivem aqui, e é de propósito: os dias
 * servem à coluna `date` da vistoria, que já é calendário local; os instantes
 * servem aos carimbos com hora, que precisam ser fechados pelo relógio de São
 * Paulo. Trocar um pelo outro é como o chamado das 21h do dia 31 cai no mês
 * seguinte.
 */
describe('resolvePeriod', () => {
  it('fecha o mês pelo relógio local, e não pelo UTC', () => {
    const p = resolvePeriod(2026, 8);

    expect(p.from_day).toBe('2026-08-01');
    expect(p.to_day).toBe('2026-08-31');
    expect(p.from_instant.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(p.to_instant.toISOString()).toBe('2026-09-01T02:59:59.999Z');
    expect(p.label).toBe('Agosto de 2026');
  });

  it('a última noite do mês continua dentro do intervalo', () => {
    const p = resolvePeriod(2026, 8);
    // 31/08 às 21h em São Paulo = 01/09 às 00h em UTC.
    expect(new Date('2026-09-01T00:00:00.000Z').getTime()).toBeLessThan(p.to_instant.getTime());
  });

  it('sem mês, o período é o ano inteiro', () => {
    const p = resolvePeriod(2026);

    expect(p.from_day).toBe('2026-01-01');
    expect(p.to_day).toBe('2026-12-31');
    expect(p.label).toBe('2026');
  });

  it('acerta o último dia de fevereiro, inclusive no bissexto', () => {
    expect(resolvePeriod(2026, 2).to_day).toBe('2026-02-28');
    expect(resolvePeriod(2028, 2).to_day).toBe('2028-02-29');
  });

  it('dezembro não vaza para o ano seguinte', () => {
    const p = resolvePeriod(2026, 12);

    expect(p.from_day).toBe('2026-12-01');
    expect(p.to_day).toBe('2026-12-31');
    expect(p.to_instant.toISOString()).toBe('2027-01-01T02:59:59.999Z');
  });
});

describe('previousPeriod', () => {
  it('de um mês, o mês anterior', () => {
    expect(previousPeriod(2026, 9).label).toBe('Agosto de 2026');
  });

  it('de janeiro, dezembro do ano anterior', () => {
    const p = previousPeriod(2026, 1);

    expect(p.label).toBe('Dezembro de 2025');
    expect(p.to_day).toBe('2025-12-31');
  });

  it('de um ano, o ano anterior', () => {
    expect(previousPeriod(2026).label).toBe('2025');
  });
});
