import {
  FAIXAS_DE_CICLO,
  N_MINIMO,
  acumular,
  confiavel,
  previousPeriod,
  resolvePeriod,
} from '../services/analytics.service';
import { SLA_BUSINESS_DAYS } from '../utils/sla';

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

/**
 * A fila acumulada.
 *
 * O saldo mensal oscila em torno do zero e a barra de um mês ruim é igual à de
 * um mês bom; a soma corrida é que mostra se a fila cresce. Ela só diz a
 * verdade se partir do que já estava aberto quando o ano começou.
 */
describe('acumular', () => {
  let n = 0;
  const mes = (abertos: number, fechados: number) => ({ mes: (n += 1), abertos, fechados });

  beforeEach(() => {
    n = 0;
  });

  it('parte do que já estava em aberto, e não do zero', () => {
    const linha = acumular([mes(3, 1)], 10);

    expect(linha[0].saldo).toBe(2);
    expect(linha[0].acumulado).toBe(12);
  });

  it('soma mês a mês, sem reiniciar', () => {
    const linha = acumular([mes(5, 2), mes(1, 4), mes(0, 0)], 0);

    expect(linha.map((m) => m.acumulado)).toEqual([3, 0, 0]);
  });

  it('deixa a fila encolher abaixo do ponto de partida', () => {
    const linha = acumular([mes(0, 4), mes(0, 4)], 6);

    expect(linha.map((m) => m.acumulado)).toEqual([2, -2]);
  });

  it('preserva os campos que já vinham do mês', () => {
    const linha = acumular([{ mes: 3, abertos: 2, fechados: 2 }], 0);

    expect(linha[0]).toEqual({
      mes: 3,
      abertos: 2,
      fechados: 2,
      saldo: 0,
      acumulado: 0,
      futuro: false,
    });
  });

  /**
   * O mês que ainda não aconteceu não é um mês de saldo zero: é um mês sem
   * dado. Sem a marca, a linha acumulada segue reta até dezembro e desenha como
   * previsão o que é só ausência.
   */
  it('marca como futuro o que vem depois do último mês fechado', () => {
    const linha = acumular([mes(4, 1), mes(0, 0), mes(0, 0)], 0, 1);

    expect(linha.map((m) => m.futuro)).toEqual([false, true, true]);
    expect(linha.map((m) => m.acumulado)).toEqual([3, 3, 3]);
  });

  it('ano inteiro no passado não tem futuro nenhum', () => {
    const linha = acumular([mes(1, 0), mes(0, 1)], 0);

    expect(linha.every((m) => m.futuro === false)).toBe(true);
  });
});

/**
 * O piso de denominador.
 *
 * Não é rigor estatístico — é o ponto em que "um de dois deu errado" para de
 * ser desenhado com o mesmo peso de "trinta de duzentos".
 */
describe('confiavel', () => {
  it('exige pelo menos cinco observações', () => {
    expect(N_MINIMO).toBe(5);
    expect(confiavel(4)).toBe(false);
    expect(confiavel(5)).toBe(true);
  });

  it('período vazio nunca sustenta leitura', () => {
    expect(confiavel(0)).toBe(false);
  });
});

/**
 * As faixas da distribuição de tempo de resolução.
 *
 * Os cortes existem para que cada barra se leia contra uma promessa do produto,
 * e não contra um número inventado. Se os prazos mudarem e as faixas não, o
 * gráfico passa a dizer "dentro do prazo" sobre uma faixa que estourou — este
 * teste é o que avisa.
 */
describe('FAIXAS_DE_CICLO', () => {
  it('tem um corte em cada prazo do produto', () => {
    const cortes = FAIXAS_DE_CICLO.flatMap((f) => f.id.split('-').map(Number)).filter(
      (n) => !Number.isNaN(n)
    );

    for (const prazo of Object.values(SLA_BUSINESS_DAYS)) {
      expect(cortes).toContain(prazo);
    }
  });

  it('só a última faixa é aberta, e é a única marcada como acima', () => {
    const acima = FAIXAS_DE_CICLO.filter((f) => f.acima);

    expect(acima).toHaveLength(1);
    expect(acima[0].id).toBe('15+');
    expect(FAIXAS_DE_CICLO[FAIXAS_DE_CICLO.length - 1].id).toBe('15+');
  });

  it('não repete faixa', () => {
    const ids = FAIXAS_DE_CICLO.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
