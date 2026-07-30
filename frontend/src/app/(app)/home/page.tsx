'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import MonthlyHeatmap from '@/components/heatmap/MonthlyHeatmap';
import { useAuthStore } from '@/store/auth.store';
import { useCalendarMonth } from '@/hooks/useCalendar';
import { formatDateLong } from '@/lib/utils';

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const { data: calendarData = {} } = useCalendarMonth(year, month);

  const canInspect = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-text-secondary text-sm capitalize">{formatDateLong(today)}</p>
          <h1 className="text-2xl font-extrabold text-text-primary mt-0.5">
            Olá, {user?.name.split(' ')[0]} 👋
          </h1>
        </div>
        <Avatar name={user?.name || ''} src={user?.avatarUrl} size="md" />
      </div>

      {/* Botão fazer inspeção */}
      {canInspect && (
        <Button
          size="lg"
          onClick={() => router.push('/inspecao')}
          className="mb-6 gap-3"
        >
          <ClipboardCheck size={22} />
          Fazer Inspeção
        </Button>
      )}

      {/* Heatmap mensal */}
      <div className="bg-bg-card rounded-2xl p-4 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-text-primary">Atividade</h2>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="text-text-muted hover:text-text-primary transition-colors p-1">
              <ChevronLeft size={18} />
            </button>
            <button onClick={nextMonth} className="text-text-muted hover:text-text-primary transition-colors p-1">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <MonthlyHeatmap
          data={calendarData}
          year={year}
          month={month}
          onDayClick={(date, day) => {
            if (day.reportIds.length === 1) {
              router.push(`/historico/${day.reportIds[0]}`);
            } else {
              router.push(`/historico?date=${date}`);
            }
          }}
        />
      </div>
    </div>
  );
}
