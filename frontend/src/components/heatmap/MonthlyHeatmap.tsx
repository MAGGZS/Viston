'use client';

import { useState } from 'react';
import { cn, getHeatIntensity } from '@/lib/utils';
import type { CalendarDay } from '@/types';
import { Avatar } from '@/components/ui/Card';

const HEAT_CLASSES: Record<number, string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
  5: 'bg-heat-5',
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface HeatmapProps {
  data: Record<string, CalendarDay>;
  year: number;
  month: number;
  onDayClick?: (date: string, day: CalendarDay) => void;
}

export default function MonthlyHeatmap({ data, year, month, onDayClick }: HeatmapProps) {
  const [tooltip, setTooltip] = useState<{ date: string; day: CalendarDay } | null>(null);

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();

  // Preenche grid com nulls antes do primeiro dia
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Completa até múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="select-none">
      <p className="text-sm font-semibold text-text-secondary mb-3">
        {MONTHS_PT[month - 1]} {year}
      </p>

      {/* Cabeçalho dias da semana */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-text-muted font-medium">{d}</div>
        ))}
      </div>

      {/* Grid de semanas */}
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="aspect-square" />;

              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayData = data[dateStr];
              const intensity = getHeatIntensity(dayData?.count || 0);
              const isToday =
                dateStr === new Date().toISOString().split('T')[0];

              return (
                <button
                  key={di}
                  onClick={() => {
                    if (dayData) {
                      setTooltip(tooltip?.date === dateStr ? null : { date: dateStr, day: dayData });
                      onDayClick?.(dateStr, dayData);
                    }
                  }}
                  className={cn(
                    'aspect-square rounded-md transition-all',
                    HEAT_CLASSES[intensity],
                    isToday && 'ring-1 ring-accent',
                    dayData && 'cursor-pointer hover:ring-1 hover:ring-accent/60',
                    !dayData && 'cursor-default',
                  )}
                  title={dayData ? `${dayData.count} vistoria(s)` : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Tooltip/popover do dia clicado */}
      {tooltip && (
        <div className="mt-3 p-3 bg-bg-elevated rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-text-secondary mb-2">
            {new Date(tooltip.date + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
          <p className="text-sm font-semibold text-text-primary mb-2">
            {tooltip.day.count} vistoria{tooltip.day.count > 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {tooltip.day.inspectors.map((inspector) => (
              <div key={inspector.id} className="flex items-center gap-1.5">
                <Avatar name={inspector.name} src={inspector.avatarUrl} size="sm" />
                <span className="text-xs text-text-secondary">{inspector.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legenda */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-[10px] text-text-muted">Menos</span>
        {[0, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn('w-3 h-3 rounded-sm', HEAT_CLASSES[i])} />
        ))}
        <span className="text-[10px] text-text-muted">Mais</span>
      </div>
    </div>
  );
}
