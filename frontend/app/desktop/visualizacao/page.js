'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Building2, Eye } from 'lucide-react';
import Link from 'next/link';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
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
      <Building2 size={48} className="anim-pop-in text-chip mb-4" />
      <p className="anim-fade-up anim-d1 text-white font-semibold text-lg">Você não tem ligação a nenhum prédio</p>
      <p className="anim-fade-up anim-d2 text-mute text-sm mt-2 mb-6">Peça a chave ao gestor do prédio e digite abaixo para se conectar.</p>
      <div className="anim-fade-up anim-d3" style={{ width: '100%', maxWidth: 380 }}>
        <JoinBuildingForm />
      </div>
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
    <RouteGuard roles={['INSPECTOR', 'VIEWER', 'NONE']}>
      <div className="hidden lg:flex flex-col min-h-screen bg-page">
        {/* Header */}
        <header className="anim-fade-down" style={{ height: 60, background: '#0B0B0B', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
          <Logo size={18} />
          <Link href="/perfil" aria-label="Abrir perfil" className="transition-transform duration-150 hover:scale-105" style={{ display: 'flex', alignItems: 'center' }}>
            <Avatar user={user} size={32} />
          </Link>
        </header>

        {/* Main */}
        <main className="flex-1 p-8 overflow-auto flex flex-col">
          <div className="anim-fade-up mb-8">
            <h1 className="text-2xl font-semibold text-white">
              Olá, <span style={{ color: '#F5C518' }}>{user?.name ?? ''}</span>
            </h1>
            <p className="text-mute text-sm mt-1">Fique por dentro de como anda a estrutura do prédio</p>
          </div>

          {buildingsLoading ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-1 h-64 bg-card rounded-card animate-pulse" />
              <div className="col-span-2 h-64 bg-card rounded-card animate-pulse" />
            </div>
          ) : !hasBuilding ? (
            <NoPredioState />
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {/* Calendário heatmap */}
              <div className="anim-fade-up anim-d1 col-span-1 bg-card rounded-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prev} aria-label="Mês anterior" className="p-1 text-mute hover:text-white transition-transform duration-150 hover:-translate-x-0.5"><ChevronLeft size={18} /></button>
                  {/* `key` no mês: a troca reanima o rótulo, então o clique tem resposta visível */}
                  <span key={monthLabel} className="anim-fade-in text-white text-sm font-semibold capitalize">{monthLabel}</span>
                  <button onClick={next} aria-label="Próximo mês" className="p-1 text-mute hover:text-white transition-transform duration-150 hover:translate-x-0.5"><ChevronRight size={18} /></button>
                </div>
                {calLoading ? <Skeleton className="h-48 w-full" /> : (
                  <CalendarHeatmap heatmap={calData?.heatmap ?? {}} month={month} year={year}
                    onDayClick={(day, info) => setDayModal({ day, info })} />
                )}
                <div className="flex items-center gap-1 mt-3 justify-end">
                  <span className="text-mute text-xs">Menos</span>
                  {['bg-chip', 'bg-[#2E2A12]', 'bg-[#6B5A00]', 'bg-[#A88A00]', 'bg-accent'].map((c, i) => (
                    <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                  ))}
                  <span className="text-mute text-xs">Mais</span>
                </div>
              </div>

              {/* Tabela de inspeções */}
              <div className="anim-fade-up anim-d2 col-span-2 bg-card rounded-card overflow-hidden">
                <div className="px-6 py-4 border-b border-line">
                  <h2 className="text-white font-semibold">Inspeções Recentes — {myBuildings[0]?.name}</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line">
                      {['Inspetor', 'Status', 'Data', 'Excel'].map((h) => (
                        <th key={h} className="text-left px-6 py-3 text-mute text-xs font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspLoading && [1, 2, 3].map((i) => (
                      <tr key={i} className="border-b border-line">
                        {[1, 2, 3, 4].map((j) => <td key={j} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td>)}
                      </tr>
                    ))}
                    {rows.map((r, idx) => (
                      <tr key={r.id} className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} border-b border-line hover:bg-chip transition-colors`}>
                        <td className="px-6 py-3 text-white text-sm">{r.inspector?.name ?? '—'}</td>
                        <td className="px-6 py-3">
                          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="px-6 py-3 text-mute text-sm">
                          {format(new Date(r.finished_at || r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-4">
                            {r.excel_url ? (
                              <a href={r.excel_url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-accent text-sm hover:underline">
                                <Download size={13} /> Baixar
                              </a>
                            ) : <span className="text-mute text-sm">—</span>}
                            <button onClick={() => setPreviewId(r.id)}
                              className="flex items-center gap-1 text-mute text-sm hover:text-white transition-all duration-150 active:scale-95">
                              <Eye size={13} /> Prévia
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!inspLoading && rows.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-mute text-sm">Nenhuma inspeção encontrada</td></tr>
                    )}
                  </tbody>
                </table>
                {hasNextPage && (
                  <div className="px-6 py-4 border-t border-line flex justify-center">
                    <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>Carregar mais</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile fallback */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">📱</p>
          <p className="text-white font-semibold text-lg">Use o app mobile</p>
          <p className="text-mute text-sm mt-2">Esta visualização é otimizada para desktop</p>
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
