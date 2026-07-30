'use client';

import { cn, getHeatIntensity } from '@/lib/utils';

const HEAT_CLASSES: Record<number, string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
  5: 'bg-heat-5',
};

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface RangeHeatmapProps {
  data: Record<string, number>;
  months?: number; // 6 ou 12
}

export default function RangeHeatmap({ data, months = 6 }: RangeHeatmapProps) {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - months + 1);
  start.setDate(1);

  // Gera todas as semanas no range
  const weeks: { date: string; count: number }[][] = [];
  const cursor = new Date(start);
  // Recua até domingo
  cursor.setDate(cursor.getDate() - cursor.getDay());

  while (cursor <= today) {
    const week: { date: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cursor.toISOString().split('T')[0];
      week.push({ date: dateStr, count: data[dateStr] || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  // Meses para o cabeçalho
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].date).getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ label: MONTHS_PT[m], col: wi });
      lastMonth = m;
    }
  });

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-max">
        {/* Cabeçalho de meses */}
        <div className="flex gap-1 pl-6">
          {weeks.map((_, wi) => {
            const label = monthLabels.find((m) => m.col === wi);
            return (
              <div key={wi} className="w-3 text-[9px] text-text-muted">
                {label?.label || ''}
              </div>
            );
          })}
        </div>

        {/* Grid: linhas = dias da semana, colunas = semanas */}
        {WEEKDAYS_SHORT.map((wd, di) => (
          <div key={di} className="flex items-center gap-1">
            <span className="w-5 text-[9px] text-text-muted text-right">{di % 2 === 1 ? wd : ''}</span>
            {weeks.map((week, wi) => {
              const cell = week[di];
              const intensity = getHeatIntensity(cell.count);
              const isToday = cell.date === today.toISOString().split('T')[0];
              return (
                <div
                  key={wi}
                  title={cell.count > 0 ? `${cell.date}: ${cell.count} vistoria(s)` : cell.date}
                  className={cn(
                    'w-3 h-3 rounded-sm',
                    HEAT_CLASSES[intensity],
                    isToday && 'ring-1 ring-accent',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
