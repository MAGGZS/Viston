'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MonthlyHeatmap from '@/components/heatmap/MonthlyHeatmap';
import RangeHeatmap from '@/components/heatmap/RangeHeatmap';
import { useCalendarMonth, useCalendarRange } from '@/hooks/useCalendar';
import { cn } from '@/lib/utils';

type ViewMode = 'mensal' | 'semestral' | 'anual';

export default function AdminCalendarioPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>('mensal');
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: monthData = {} } = useCalendarMonth(year, month);
  const { data: semestralData = {} } = useCalendarRange('semestral');
  const { data: anualData = {} } = useCalendarRange('anual');

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const MODES: { value: ViewMode; label: string }[] = [
    { value: 'mensal', label: 'Mensal' },
    { value: 'semestral', label: '6 meses' },
    { value: 'anual', label: 'Anual' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold text-text-primary">Calendário de Atividade</h1>

        {/* Toggle de modo */}
        <div className="flex bg-bg-card rounded-xl p-1 border border-white/10">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                mode === m.value
                  ? 'bg-accent text-bg-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card rounded-2xl p-6 border border-white/5">
        {mode === 'mensal' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="text-text-muted hover:text-text-primary transition-colors p-1">
                <ChevronLeft size={20} />
              </button>
              <button onClick={nextMonth} className="text-text-muted hover:text-text-primary transition-colors p-1">
                <ChevronRight size={20} />
              </button>
            </div>
            <MonthlyHeatmap
              data={monthData}
              year={year}
              month={month}
              onDayClick={(date, day) => {
                if (day.reportIds.length === 1) {
                  router.push(`/historico/${day.reportIds[0]}`);
                } else {
                  router.push(`/admin/historico?date=${date}`);
                }
              }}
            />
          </>
        )}

        {mode === 'semestral' && (
          <RangeHeatmap data={semestralData} months={6} />
        )}

        {mode === 'anual' && (
          <RangeHeatmap data={anualData} months={12} />
        )}
      </div>
    </div>
  );
}
