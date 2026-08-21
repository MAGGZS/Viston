import { zonedDateOnly, zonedDayKey, zonedParts, zonedRange } from '../utils/timezone';
import { buildHeatmap } from '../services/inspection.service';

// 09/08/2026 às 22:30 em São Paulo = 10/08/2026 01:30 UTC.
// É o caso que quebrava: vistoria da noite aparecia no dia seguinte.
const LATE_NIGHT = new Date('2026-08-10T01:30:00.000Z');

describe('utils/timezone', () => {
  it('usa o dia do calendário local, não o dia UTC', () => {
    expect(zonedDayKey(LATE_NIGHT)).toBe('2026-08-09');
  });

  it('grava a coluna DATE como meia-noite UTC do dia local', () => {
    expect(zonedDateOnly(LATE_NIGHT).toISOString()).toBe('2026-08-09T00:00:00.000Z');
  });

  it('quebra o instante nas partes do calendário local', () => {
    expect(zonedParts(LATE_NIGHT)).toEqual({ year: 2026, monthIndex: 7, day: 9 });
  });

  it('fecha o mês pelo relógio local', () => {
    const { start, end } = zonedRange(2026, 7, 1); // agosto/2026

    expect(start.toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T02:59:59.999Z');
    // A última noite do mês precisa continuar dentro do intervalo
    expect(new Date('2026-08-31T23:30:00.000Z').getTime()).toBeLessThan(end.getTime());
  });
});

describe('buildHeatmap', () => {
  it('agrupa a vistoria da noite no dia local em que ela foi feita', () => {
    const heatmap = buildHeatmap([
      {
        id: 'report-1',
        finished_at: LATE_NIGHT,
        excel_path: null,
        inspector: { id: 'user-1', name: 'Carlos' },
      },
    ]);

    expect(Object.keys(heatmap)).toEqual(['2026-08-09']);
    expect(heatmap['2026-08-09'].count).toBe(1);
    expect(heatmap['2026-08-09'].inspectors).toEqual(['Carlos']);
  });

  it('ignora relatório sem conclusão', () => {
    expect(buildHeatmap([{ id: 'r', finished_at: null, excel_path: null, inspector: null }])).toEqual({});
  });
});
