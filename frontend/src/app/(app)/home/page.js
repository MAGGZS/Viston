'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Spinner } from '@/components/ui';
import { HeatmapCalendar } from '@/components/HeatmapCalendar';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', month, year],
    queryFn: () => api.get(`/calendar?month=${month}&year=${year}`).then((r) => r.data),
  });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const canInspect = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-text-secondary text-sm capitalize">
            {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          <h1 className="text-xl font-extrabold mt-0.5">Olá, {user?.name?.split(' ')[0]} 👋</h1>
        </div>
        <Avatar name={user?.name} url={user?.avatarUrl} size="md" />
      </div>

      {/* Inspect button */}
      {canInspect && (
        <button
          onClick={() => router.push('/inspecao')}
          className="btn-primary w-full mb-6 py-4 text-base"
        >
          <ClipboardCheck className="w-5 h-5" />
          Fazer Inspeção
        </button>
      )}

      {/* Calendar navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 text-text-secondary hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold capitalize">
          {format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR })}
        </span>
        <button onClick={nextMonth} className="p-1 text-text-secondary hover:text-white">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <HeatmapCalendar heatmap={data?.heatmap || []} month={month} year={year} />
      )}
    </div>
  );
}
