'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, UserCircle, Building2, Eye } from 'lucide-react';
import Link from 'next/link';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Logo } from '@/app/components/Logo';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { Badge, Skeleton, Button } from '@/app/components/ui';
import { useCalendar, useBuildingHistory, useMyBuildings } from '@/app/hooks/useApi';
import { useAuthStore } from '@/app/store/auth';

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success', COMPLETED: 'success' };

function NoPredioState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
      <Building2 size={48} className="text-[#2A2A2A] mb-4" />
      <p className="text-white font-semibold text-lg">Você não tem ligação a nenhum prédio</p>
      <p className="text-[#9A9A9A] text-sm mt-2">Peça ao administrador o ID do prédio e solicite acesso.</p>
    </div>
  );
}

export default function VisualizacaoPage() {
  const { user } = useAuthStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const buildingId = myBuildings[0]?.id;

  const { data: calData, isLoading: calLoading } = useCalendar(
    hasBuilding ? { month, year, building_id: buildingId } : null
  );
  const { data: inspData, isLoading: inspLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useBuildingHistory(
    hasBuilding ? buildingId : null
  );

  const rows = inspData?.pages?.flatMap((p) => p.inspections) ?? [];

  function prev() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard roles={['INSPECTOR', 'VIEWER']}>
      <div className="hidden lg:flex flex-col min-h-screen bg-[#0D0D0D]">
        {/* Header */}
        <header style={{ height: 60, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
          <Logo size={18} />
          <Link href="/perfil" style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.9)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <UserCircle size={28} strokeWidth={1.5} />
          </Link>
        </header>

        {/* Main */}
        <main className="flex-1 p-8 overflow-auto flex flex-col">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">
              Olá, <span style={{ color: '#F5C518' }}>{user?.name ?? ''}</span>
            </h1>
            <p className="text-[#9A9A9A] text-sm mt-1">Fique por dentro de como anda a estrutura do prédio</p>
          </div>

          {buildingsLoading ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-1 h-64 bg-[#1A1A1A] rounded-2xl animate-pulse" />
              <div className="col-span-2 h-64 bg-[#1A1A1A] rounded-2xl animate-pulse" />
            </div>
          ) : !hasBuilding ? (
            <NoPredioState />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {/* Calendário heatmap */}
              <div className="col-span-1 bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-5">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prev} className="p-1 text-[#9A9A9A] hover:text-white"><ChevronLeft size={18} /></button>
                  <span className="text-white text-sm font-semibold capitalize">{monthLabel}</span>
                  <button onClick={next} className="p-1 text-[#9A9A9A] hover:text-white"><ChevronRight size={18} /></button>
                </div>
                {calLoading ? <Skeleton className="h-48 w-full" /> : (
                  <CalendarHeatmap heatmap={calData?.heatmap ?? {}} month={month} year={year}
                    onDayClick={(day, info) => setDayModal({ day, info })} />
                )}
                <div className="flex items-center gap-1 mt-3 justify-end">
                  <span className="text-[#9A9A9A] text-xs">Menos</span>
                  {['bg-[#1E1E1E]', 'bg-[#2E2A12]', 'bg-[#6B5A00]', 'bg-[#A88A00]', 'bg-[#F5C518]'].map((c, i) => (
                    <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                  ))}
                  <span className="text-[#9A9A9A] text-xs">Mais</span>
                </div>
              </div>

              {/* Tabela de inspeções */}
              <div className="col-span-2 bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#2A2A2A]">
                  <h2 className="text-white font-semibold">Inspeções Recentes — {myBuildings[0]?.name}</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2A2A2A]">
                      {['Inspetor', 'Status', 'Data', 'Excel'].map((h) => (
                        <th key={h} className="text-left px-6 py-3 text-[#9A9A9A] text-xs font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspLoading && [1, 2, 3].map((i) => (
                      <tr key={i} className="border-b border-[#2A2A2A]">
                        {[1, 2, 3, 4].map((j) => <td key={j} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td>)}
                      </tr>
                    ))}
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-[#2A2A2A] hover:bg-[#1E1E1E] transition-colors">
                        <td className="px-6 py-3 text-white text-sm">{r.inspector?.name ?? '—'}</td>
                        <td className="px-6 py-3">
                          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-3 text-[#9A9A9A] text-sm">
                          {format(new Date(r.finished_at || r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-4">
                            {r.excel_url ? (
                              <a href={r.excel_url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-[#F5C518] text-sm hover:underline">
                                <Download size={13} /> Baixar
                              </a>
                            ) : <span className="text-[#9A9A9A] text-sm">—</span>}
                            <button onClick={() => setPreviewId(r.id)}
                              className="flex items-center gap-1 text-[#9A9A9A] text-sm hover:text-white transition-colors">
                              <Eye size={13} /> Prévia
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!inspLoading && rows.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-[#9A9A9A] text-sm">Nenhuma inspeção encontrada</td></tr>
                    )}
                  </tbody>
                </table>
                {hasNextPage && (
                  <div className="px-6 py-4 border-t border-[#2A2A2A] flex justify-center">
                    <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>Carregar mais</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile fallback */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div>
          <p className="text-4xl mb-4">📱</p>
          <p className="text-white font-bold text-lg">Use o app mobile</p>
          <p className="text-[#9A9A9A] text-sm mt-2">Esta visualização é otimizada para desktop</p>
        </div>
      </div>

      <DayInspectionsModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        day={dayModal?.day}
        info={dayModal?.info}
      />

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />
    </RouteGuard>
  );
}
