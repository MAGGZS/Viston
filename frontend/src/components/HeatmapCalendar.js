'use client';

import { useState } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import { Avatar } from './ui';

const HEAT_COLORS = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'];

function getHeatLevel(count) {
  if (!count) return 0;
  if (count === 1) return 2;
  if (count === 2) return 3;
  return 4;
}

export function HeatmapCalendar({ heatmap = [], month, year }) {
  const [tooltip, setTooltip] = useState(null);

  const date = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
  const firstDayOfWeek = getDay(days[0]);

  const byDate = {};
  for (const item of heatmap) {
    byDate[item.date] = item;
  }

  return (
    <div className="card">
      <h3 className="font-bold text-sm mb-3 capitalize">
        {format(date, 'MMMM yyyy', { locale: ptBR })}
      </h3>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] text-text-secondary text-center">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const data = byDate[key];
          const level = getHeatLevel(data?.count);
          const isToday = key === format(new Date(), 'yyyy-MM-dd');

          return (
            <div
              key={key}
              className={clsx(
                'aspect-square rounded-md cursor-pointer transition-transform hover:scale-110 relative',
                HEAT_COLORS[level],
                isToday && 'ring-1 ring-accent'
              )}
              onClick={() => data && setTooltip(tooltip?.date === key ? null : { date: key, ...data })}
              title={format(day, 'd')}
            />
          );
        })}
      </div>

      {tooltip && (
        <div className="mt-3 p-3 bg-bg-secondary rounded-xl border border-white/10">
          <p className="text-xs text-text-secondary mb-2">
            {format(new Date(tooltip.date + 'T12:00:00'), "d 'de' MMMM", { locale: ptBR })}
            {' — '}{tooltip.count} vistoria{tooltip.count > 1 ? 's' : ''}
          </p>
          <div className="flex flex-col gap-2">
            {tooltip.entries?.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <Avatar name={e.inspector.name} url={e.inspector.avatarUrl} size="sm" />
                <span className="text-sm">{e.inspector.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
