'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { Button, Card, Modal, Skeleton } from '@/app/components/ui';
import { useAuthStore } from '@/app/store/auth';
import { useCalendar } from '@/app/hooks/useApi';

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);

  const { data, isLoading } = useCalendar({ month, year });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const canInspect = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';
  const monthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard>
      <div className="min-h-screen bg-[#0D0D0D] pb-24">
        <div className="px-5 pt-12 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#9A9A9A] text-sm capitalize">
                {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
              <h1 className="text-2xl font-bold text-white mt-1">
                Olá, {user?.name?.split(' ')[0]} 👋
              </h1>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#F5C518] flex items-center justify-center">
              <span className="text-black font-bold text-lg">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {canInspect && (
          <div className="px-5 mb-6">
            <button
              onClick={() => router.push('/inspecao')}
              className="w-full bg-[#F5C518] text-black rounded-2xl p-5 flex items-center gap-4 hover:bg-[#E0B400] transition-colors"
            >
              <div className="w-12 h-12 bg-black/20 rounded-xl flex items-center justify-center">
                <ClipboardCheck size={24} />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Fazer Inspeção</p>
                <p className="text-sm opacity-70">Iniciar nova vistoria</p>
              </div>
            </button>
          </div>
        )}

        <div className="px-5">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1 text-[#9A9A9A] hover:text-white">
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-white font-semibold capitalize">{monthLabel}</h2>
              <button onClick={nextMonth} className="p-1 text-[#9A9A9A] hover:text-white">
                <ChevronRight size={20} />
              </button>
            </div>

            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <CalendarHeatmap
                heatmap={data?.heatmap || {}}
                month={month}
                year={year}
                onDayClick={(day, info) => setDayModal({ day, info })}
              />
            )}

            <div className="flex items-center gap-2 mt-4 justify-end">
              <span className="text-[#9A9A9A] text-xs">Menos</span>
              {['bg-[#1E1E1E]', 'bg-[#2E2A12]', 'bg-[#6B5A00]', 'bg-[#A88A00]', 'bg-[#F5C518]'].map((c, i) => (
                <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
              ))}
              <span className="text-[#9A9A9A] text-xs">Mais</span>
            </div>
          </Card>
        </div>

        <Modal open={!!dayModal} onClose={() => setDayModal(null)} title={dayModal?.day}>
          <p className="text-[#9A9A9A] text-sm mb-3">{dayModal?.info?.count} inspeção(ões) realizada(s)</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {dayModal?.info?.inspectors?.map((name, i) => (
              <span key={i} className="bg-[#2A2A2A] text-white text-xs px-3 py-1 rounded-full">{name}</span>
            ))}
          </div>
          <Button variant="secondary" className="w-full" onClick={() => {
            router.push(`/historico?date_from=${dayModal?.day}&date_to=${dayModal?.day}`);
            setDayModal(null);
          }}>
            Ver relatórios do dia
          </Button>
        </Modal>

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
