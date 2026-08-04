'use client';
import { useState, useMemo } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { useCalendar } from '@/app/hooks/useApi';

const MODES = ['Mensal', 'Semestral', 'Anual'];

function intensity(count) {
  if (!count) return 'bg-[#1E1E1E]';
  if (count === 1) return 'bg-[#2E2A12]';
  if (count === 2) return 'bg-[#6B5A00]';
  if (count === 3) return 'bg-[#A88A00]';
  return 'bg-[#F5C518]';
}

function MonthGrid({ heatmap, year, month, onDayClick }) {
  const days = eachDayOfInterval({ start: startOfMonth(new Date(year, month - 1)), end: endOfMonth(new Date(year, month - 1)) });
  const startWeekday = days[0].getDay();

  return (
    <div>
      <p className="text-[#9A9A9A] text-xs font-medium mb-2 capitalize">
        {format(new Date(year, month - 1), 'MMMM', { locale: ptBR })}
      </p>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <span key={i} className="text-[#9A9A9A] text-xs text-center">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startWeekday }).map((_, i) => <div key={`e${i}`} />)}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const info = heatmap?.[key];
          return (
            <button
              key={key}
              title={`${key}: ${info?.count ?? 0} inspeção(ões)`}
              onClick={() => info?.count && onDayClick?.(key, info)}
              className={`aspect-square rounded-sm ${intensity(info?.count)} hover:ring-1 hover:ring-[#F5C518]/50 transition-all`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function AdminCalendarioPage() {
  const [mode, setMode] = useState('Mensal');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState(null);

  // Para mensal: busca mês atual. Para semestral/anual: busca o ano inteiro
  const params = useMemo(() => {
    if (mode === 'Mensal') return { month, year };
    return { year };
  }, [mode, month, year]);

  const { data, isLoading } = useCalendar(params);
  const heatmap = data?.heatmap ?? {};

  const months = useMemo(() => {
    if (mode === 'Mensal') return [month];
    if (mode === 'Semestral') {
      const start = month <= 6 ? 1 : 7;
      return Array.from({ length: 6 }, (_, i) => start + i);
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [mode, month]);

  function prev() {
    if (mode === 'Mensal') {
      if (month === 1) { setMonth(12); setYear((y) => y - 1); }
      else setMonth((m) => m - 1);
    } else {
      setYear((y) => y - 1);
    }
  }

  function next() {
    if (mode === 'Mensal') {
      if (month === 12) { setMonth(1); setYear((y) => y + 1); }
      else setMonth((m) => m + 1);
    } else {
      setYear((y) => y + 1);
    }
  }

  const navLabel = mode === 'Mensal'
    ? format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR })
    : mode === 'Semestral'
    ? `${month <= 6 ? '1º' : '2º'} semestre ${year}`
    : `${year}`;

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Calendário</h1>

            {/* Toggle de modo */}
            <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-1 gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === m ? 'bg-[#F5C518] text-black' : 'text-[#9A9A9A] hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Navegação */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={prev} className="p-2 text-[#9A9A9A] hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors">
              <ChevronLeft size={20} />
            </button>
            <span className="text-white font-semibold capitalize min-w-48 text-center">{navLabel}</span>
            <button onClick={next} className="p-2 text-[#9A9A9A] hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Grid de meses */}
          {isLoading ? (
            <div className="text-[#9A9A9A] text-sm">Carregando...</div>
          ) : (
            <div className={`grid gap-8 ${
              mode === 'Mensal' ? 'grid-cols-1 max-w-sm' :
              mode === 'Semestral' ? 'grid-cols-3' :
              'grid-cols-4'
            }`}>
              {months.map((m) => (
                <div key={m} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-5">
                  <MonthGrid
                    heatmap={heatmap}
                    year={year}
                    month={m}
                    onDayClick={(day, info) => setSelected({ day, info })}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Legenda */}
          <div className="flex items-center gap-2 mt-6">
            <span className="text-[#9A9A9A] text-xs">Menos</span>
            {['bg-[#1E1E1E]', 'bg-[#2E2A12]', 'bg-[#6B5A00]', 'bg-[#A88A00]', 'bg-[#F5C518]'].map((c, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
            <span className="text-[#9A9A9A] text-xs">Mais</span>
          </div>

          {/* Tooltip/detalhe do dia selecionado */}
          {selected && (
            <div className="fixed bottom-8 right-8 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 shadow-2xl min-w-64">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-semibold">{selected.day}</p>
                <button onClick={() => setSelected(null)} className="text-[#9A9A9A] hover:text-white text-lg leading-none">×</button>
              </div>
              <p className="text-[#9A9A9A] text-sm mb-2">{selected.info.count} inspeção(ões)</p>
              <div className="flex flex-wrap gap-2">
                {selected.info.inspectors?.map((name, i) => (
                  <span key={i} className="bg-[#2A2A2A] text-white text-xs px-3 py-1 rounded-full">{name}</span>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-white font-bold text-lg">Painel Admin</p>
          <p className="text-[#9A9A9A] text-sm mt-2">Acesse pelo computador</p>
        </div>
      </div>
    </RouteGuard>
  );
}
