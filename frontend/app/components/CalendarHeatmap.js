'use client';
import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function getIntensity(count) {
  if (!count) return 'bg-[#1E1E1E]';
  if (count === 1) return 'bg-[#2E2A12]';
  if (count === 2) return 'bg-[#6B5A00]';
  if (count === 3) return 'bg-[#A88A00]';
  return 'bg-[#F5C518]';
}

export function CalendarHeatmap({ heatmap = {}, month, year, onDayClick }) {
  const [tooltip, setTooltip] = useState(null);

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
          <div key={i} className="text-center text-[10px] text-[#9A9A9A]">{d}</div>
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
              const count = data?.count || 0;
              return (
                <div
                  key={di}
                  className={`aspect-square rounded-sm cursor-pointer transition-transform hover:scale-110 ${getIntensity(count)} relative`}
                  onClick={() => { if (count > 0 && onDayClick) onDayClick(key, data); }}
                  title={count > 0 ? `${count} inspeção(ões)` : format(day, 'd')}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/40">
                    {format(day, 'd')}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
