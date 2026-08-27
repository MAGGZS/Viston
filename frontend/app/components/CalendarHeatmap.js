'use client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { CalendarDayCell } from '@/app/components/CalendarDayCell';
import { T, heatColor } from '@/app/lib/theme';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function CalendarHeatmap({ heatmap = {}, month, year, onDayClick }) {
  const date = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
  const firstDayOfWeek = getDay(days[0]);

  // Preencher dias vazios no início
  const blanks = Array(firstDayOfWeek).fill(null);
  const allCells = [...blanks, ...days];

  // Agrupar em semanas
  const weeks = [];
  for (let i = 0; i < allCells.length; i += 7) {
    weeks.push(allCells.slice(i, i + 7));
  }

  return (
    <div className="w-full">
      {/* Cabeçalho dos dias */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-xs" style={{ color: T.mute }}>{d}</div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} />;
              const key = format(day, 'yyyy-MM-dd');
              const data = heatmap[key];
              return (
                <CalendarDayCell
                  key={di}
                  dayNumber={format(day, 'd')}
                  dayKey={key}
                  info={data}
                  background={heatColor(data?.count)}
                  onClick={onDayClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
