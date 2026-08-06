'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Share2, Download, Users, ClipboardList, Eye, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Badge, Skeleton, Button, Modal } from '@/app/components/ui';
import { useBuildingDashboard, useBuildingHistory } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success', COMPLETED: 'success' };

function intensity(count) {
  if (!count) return '#1E1E1E';
  if (count === 1) return '#2E2A12';
  if (count === 2) return '#6B5A00';
  if (count === 3) return '#A88A00';
  return '#F5C518';
}

function MonthGrid({ heatmap, year, month, onDayClick }) {
  const days = eachDayOfInterval({ start: startOfMonth(new Date(year, month - 1)), end: endOfMonth(new Date(year, month - 1)) });
  const blanks = Array(days[0].getDay()).fill(null);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <span key={i} style={{ textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const info = heatmap?.[key];
          return (
            <div key={key} onClick={() => info?.count && onDayClick?.(key, info)}
              title={`${key}: ${info?.count ?? 0} inspeção(ões)`}
              style={{ width: 22, height: 22, borderRadius: 4, background: intensity(info?.count), cursor: info?.count ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>{format(d, 'd')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default function BuildingDashboardPage() {
  const { id } = useParams();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState(null);
  const [shareModal, setShareModal] = useState(false);

  const { data, isLoading } = useBuildingDashboard(id);
  const { data: histData, isLoading: histLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useBuildingHistory(id);
  const { show: toast } = useToastStore();
  const rows = histData?.pages?.flatMap((p) => p.inspections) ?? [];

  const heatmap = data?.heatmap ?? {};
  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  function prev() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/desktop/admin/predios')}
                className="w-9 h-9 flex items-center justify-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[#9A9A9A] hover:text-white transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div>
                {isLoading ? <div className="h-7 w-48 bg-[#2A2A2A] rounded animate-pulse" /> : (
                  <h1 className="text-2xl font-bold text-white">{data?.building?.name}</h1>
                )}
                {data?.building?.description && (
                  <p className="text-[#9A9A9A] text-sm mt-0.5">{data.building.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/desktop/admin/predios/${id}/solicitacoes`}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[#9A9A9A] text-sm hover:text-white transition-colors">
                <Users size={15} /> Solicitações
              </Link>
              <button onClick={() => setShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[#9A9A9A] text-sm hover:text-white transition-colors">
                <Share2 size={15} /> Compartilhar ID
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { icon: ClipboardList, label: 'Total de inspeções', value: data?.totalInspections },
              { icon: Users, label: 'Inspetores', value: data?.inspectorCount },
              { icon: Eye, label: 'Visualizadores', value: data?.viewerCount },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-[#F5C518]/10 rounded-xl flex items-center justify-center">
                  <Icon size={18} className="text-[#F5C518]" />
                </div>
                <div>
                  <p className="text-[#9A9A9A] text-xs">{label}</p>
                  {isLoading ? <div className="h-6 w-12 bg-[#2A2A2A] rounded animate-pulse mt-1" /> : (
                    <p className="text-white text-xl font-bold">{value ?? 0}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Calendário + Histórico */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prev} className="p-1 text-[#9A9A9A] hover:text-white"><ChevronLeft size={16} /></button>
                <span className="text-white text-sm font-semibold capitalize">{monthLabel}</span>
                <button onClick={next} className="p-1 text-[#9A9A9A] hover:text-white"><ChevronRight size={16} /></button>
              </div>
              <MonthGrid heatmap={heatmap} year={year} month={month} onDayClick={(day, info) => setSelected({ day, info })} />
              <div className="flex items-center gap-1 mt-4 justify-end">
                <span className="text-[#9A9A9A] text-xs">Menos</span>
                {['#1E1E1E','#2E2A12','#6B5A00','#A88A00','#F5C518'].map((c, i) => (
                  <div key={i} style={{ background: c }} className="w-3 h-3 rounded-sm" />
                ))}
                <span className="text-[#9A9A9A] text-xs">Mais</span>
              </div>
            </div>

            <div className="col-span-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#2A2A2A]">
                <h2 className="text-white font-semibold">Histórico de Inspeções</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2A2A2A]">
                    {['Inspetor', 'Status', 'Data', 'Planilha'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-[#9A9A9A] text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histLoading && [1,2,3].map(i => (
                    <tr key={i} className="border-b border-[#2A2A2A]">
                      {[1,2,3,4].map(j => <td key={j} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))}
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-[#2A2A2A] hover:bg-[#1E1E1E] transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#F5C518] flex items-center justify-center">
                            <span className="text-black text-xs font-bold">{r.inspector?.name?.[0]}</span>
                          </div>
                          <span className="text-white text-sm">{r.inspector?.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-6 py-3 text-[#9A9A9A] text-sm">
                        {format(new Date(r.finished_at || r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-6 py-3">
                        {r.excel_url ? (
                          <a href={r.excel_url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-[#F5C518] text-sm hover:underline">
                            <Download size={13} /> Baixar
                          </a>
                        ) : <span className="text-[#9A9A9A] text-sm">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!histLoading && rows.length === 0 && (
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
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div><p className="text-4xl mb-4">🖥️</p><p className="text-white font-bold">Acesse pelo computador</p></div>
      </div>

      {selected && (
        <div className="fixed bottom-8 right-8 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 shadow-2xl min-w-64 z-50">
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
          {selected.info.excel_url && (
            <a href={selected.info.excel_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[#F5C518] text-sm mt-3 hover:underline">
              <Download size={13} /> Ver planilha
            </a>
          )}
        </div>
      )}

      <Modal open={shareModal} onClose={() => setShareModal(false)} title="Compartilhar ID do prédio">
        <p className="text-[#9A9A9A] text-sm mb-4">Compartilhe este ID com inspetores e visualizadores para que possam solicitar acesso.</p>
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-[#F5C518] font-mono text-sm break-all">{id}</span>
          <button onClick={() => { navigator.clipboard.writeText(id); toast('ID copiado!', 'info'); }}
            className="text-xs text-[#9A9A9A] hover:text-white whitespace-nowrap border border-[#2A2A2A] rounded-lg px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
