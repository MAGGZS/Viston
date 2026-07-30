'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, eachDayOfInterval, startOfYear, endOfYear, getDay, getMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '@/lib/api';
import { Avatar, Spinner } from '@/components/ui';
import clsx from 'clsx';

const HEAT_COLORS = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getHeatLevel(count) {
  if (!count) return 0;
  if (count === 1) return 2;
  if (count === 2) return 3;
  return 4;
}

export default function AdminCalendarioPage() {
  const [range, setRange] = useState('mensal');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year] = useState(new Date().getFullYear());
  const [tooltip, setTooltip] = useState(null);

  const queryParams = range === 'mensal'
    ? `month=${month}&year=${year}`
    : `range=${range === 'semestral' ? 'semestral' : 'anual'}`;

  const { data, isLoading } = useQuery({
    queryKey: ['calendar-admin', range, month, year],
    queryFn: () => api.get(`/calendar?${queryParams}`).then((r) => r.data),
  });

  const byDate = {};
  for (const item of data?.heatmap || []) {
    byDate[item.date] = item;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold">Calendário de Atividade</h1>
        <div className="flex gap-1 bg-bg-secondary rounded-xl p-1">
          {['mensal', 'semestral', 'anual'].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors',
                range === r ? 'bg-accent text-bg-primary' : 'text-text-secondary hover:text-white'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {range === 'mensal' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {MONTHS_PT.map((m, i) => (
            <button
              key={i}
              onClick={() => setMonth(i + 1)}
              className={clsx(
                'px-3 py-1 rounded-lg text-sm font-semibold transition-colors',
                month === i + 1 ? 'bg-accent text-bg-primary' : 'bg-bg-secondary text-text-secondary hover:text-white'
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <AnnualHeatmap byDate={byDate} year={year} range={range} month={month} tooltip={tooltip} setTooltip={setTooltip} />
      )}
    </div>
  );
}

function AnnualHeatmap({ byDate, year, range, month, tooltip, setTooltip }) {
  const startDate = range === 'anual'
    ? startOfYear(new Date(year, 0, 1))
    : range === 'semestral'
    ? new Date(year, new Date().getMonth() - 5, 1)
    : new Date(year, month - 1, 1);

  const endDate = range === 'anual'
    ? endOfYear(new Date(year, 0, 1))
    : range === 'semestral'
    ? new Date(year, new Date().getMonth() + 1, 0)
    : new Date(year, month, 0);

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const firstDow = getDay(days[0]);

  // Group into weeks for GitHub-style grid
  const weeks = [];
  let week = Array(firstDow).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);

  return (
    <div className="card overflow-x-auto">
      <div className="flex gap-1" style={{ minWidth: `${weeks.length * 18}px` }}>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map((day, di) => {
              if (!day) return <div key={di} className="w-3.5 h-3.5" />;
              const key = format(day, 'yyyy-MM-dd');
              const data = byDate[key];
              const level = getHeatLevel(data?.count);
              const isToday = key === format(new Date(), 'yyyy-MM-dd');
              return (
                <div
                  key={di}
                  onClick={() => data && setTooltip(tooltip?.date === key ? null : { date: key, ...data })}
                  className={clsx(
                    'w-3.5 h-3.5 rounded-sm cursor-pointer transition-transform hover:scale-125',
                    HEAT_COLORS[level],
                    isToday && 'ring-1 ring-accent'
                  )}
                  title={`${format(day, 'd MMM', { locale: ptBR })}${data ? ` — ${data.count} vistoria(s)` : ''}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {tooltip && (
        <div className="mt-4 p-3 bg-bg-secondary rounded-xl border border-white/10">
          <p className="text-sm font-semibold mb-2">
            {format(new Date(tooltip.date + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            <span className="text-text-secondary font-normal ml-2">— {tooltip.count} vistoria{tooltip.count > 1 ? 's' : ''}</span>
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
