'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Share2, Download, Users, ClipboardList, Eye, ArrowLeft, UserCheck, UserMinus, AlertTriangle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { CalendarDayCell } from '@/app/components/CalendarDayCell';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Skeleton, Button, Modal } from '@/app/components/ui';
import { useBuildingDashboard, useBuildingHistory, useBuildingMembers, useRemoveMember, useDeleteInspection } from '@/app/hooks/useApi';
import { formatShareKey } from '@/app/lib/shareKey';
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
    <div style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['D','S','T','Q','Q','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const info = heatmap?.[key];
          return (
            <CalendarDayCell
              key={key}
              dayNumber={format(d, 'd')}
              dayKey={key}
              info={info}
              background={intensity(info?.count)}
              onClick={onDayClick}
            />
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
  const [membersModal, setMembersModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // membro a remover
  const [confirmDiscard, setConfirmDiscard] = useState(null); // vistoria a descartar
  const [previewId, setPreviewId] = useState(null); // vistoria em prévia
  const [reportId, setReportId] = useState(null); // relatório completo aberto

  const { data, isLoading } = useBuildingDashboard(id);
  const { data: histData, isLoading: histLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useBuildingHistory(id);
  const { data: membersData, isLoading: membersLoading } = useBuildingMembers(membersModal ? id : null);
  const removeMember = useRemoveMember();
  const deleteInspection = useDeleteInspection();
  const { show: toast } = useToastStore();
  const members = membersData ?? [];
  const rows = histData?.pages?.flatMap((p) => p.inspections) ?? [];

  const heatmap = data?.heatmap ?? {};
  const shareKey = formatShareKey(data?.building?.share_key);
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
              <button onClick={() => setMembersModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-[#9A9A9A] text-sm hover:text-white transition-colors">
                <UserCheck size={15} /> Colaboradores
              </button>
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
            ].map(({ icon: Icon, label, value }, idx) => (
              <div key={label} className={`anim-fade-up anim-d${idx + 1} bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 flex items-center gap-4 hover:border-[#3A3A3A] transition-all duration-200`}>
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
          <div className="anim-fade-up anim-d4 grid grid-cols-3 gap-6">
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
                    {['Inspetor', 'Status', 'Data', 'Planilha', ''].map((h, i) => (
                      <th key={i} className="text-left px-6 py-3 text-[#9A9A9A] text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histLoading && [1,2,3].map(i => (
                    <tr key={i} className="border-b border-[#2A2A2A]">
                      {[1,2,3,4,5].map(j => <td key={j} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))}
                  {rows.map(r => (
                    <tr key={r.id} onClick={() => setReportId(r.id)}
                      className="border-b border-[#2A2A2A] hover:bg-[#1E1E1E] transition-colors cursor-pointer">
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
                        <div className="flex items-center gap-4">
                          {r.excel_url ? (
                            <a href={r.excel_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-[#F5C518] text-sm hover:underline">
                              <Download size={13} /> Baixar
                            </a>
                          ) : <span className="text-[#9A9A9A] text-sm">—</span>}
                          <button onClick={e => { e.stopPropagation(); setPreviewId(r.id); }}
                            className="flex items-center gap-1 text-[#9A9A9A] text-sm hover:text-white transition-colors">
                            <Eye size={13} /> Prévia
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDiscard(r); }}
                          disabled={deleteInspection.isPending}
                          title="Descartar vistoria"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 4, borderRadius: 8 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!histLoading && rows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-[#9A9A9A] text-sm">Nenhuma inspeção encontrada</td></tr>
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

      <DayInspectionsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        day={selected?.day}
        info={selected?.info}
      />

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />

      <Modal open={membersModal} onClose={() => setMembersModal(false)} title="Colaboradores">
        {membersLoading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-[#1A1A1A] rounded-xl animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="text-[#9A9A9A] text-sm text-center py-6">Nenhum colaborador vinculado</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-[#F5C518] flex items-center justify-center flex-shrink-0">
                  <span className="text-black text-xs font-bold">{m.user?.name?.[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.user?.name}</p>
                  <p className="text-[#9A9A9A] text-xs truncate">{m.user?.email}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: m.role === 'INSPECTOR' ? 'rgba(245,197,24,0.1)' : 'rgba(99,102,241,0.1)', color: m.role === 'INSPECTOR' ? '#F5C518' : '#a5b4fc' }}>
                  {m.role === 'INSPECTOR' ? 'Inspetor' : 'Visualizador'}
                </span>
                <button
                  onClick={() => setConfirmRemove(m)}
                  disabled={removeMember.isPending}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', padding: 4, borderRadius: 8, flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                  title="Remover vínculo">
                  <UserMinus size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirmação de desvinculo */}
      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remover colaborador">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>
              Tem certeza que deseja remover o vínculo de <span style={{ color: '#fff', fontWeight: 600 }}>{confirmRemove?.user?.name}</span> com este prédio? O usuário perderá o acesso imediatamente.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmRemove(null)}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 1 }} loading={removeMember.isPending}
              onClick={async () => {
                try {
                  await removeMember.mutateAsync({ buildingId: id, userId: confirmRemove.user_id });
                  toast(`${confirmRemove.user?.name} removido`, 'info');
                  setConfirmRemove(null);
                } catch (e) {
                  toast(e?.response?.data?.error?.message || 'Erro ao remover', 'error', e);
                }
              }}>
              Remover
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmação de descarte da vistoria */}
      <Modal open={!!confirmDiscard} onClose={() => setConfirmDiscard(null)} title="Descartar vistoria">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>
              <p>
                Descartar a vistoria de <span style={{ color: '#fff', fontWeight: 600 }}>{confirmDiscard?.inspector?.name}</span>
                {confirmDiscard && ` de ${format(new Date(confirmDiscard.finished_at || confirmDiscard.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}?
              </p>
              <p style={{ marginTop: 10, color: 'rgba(255,255,255,0.5)' }}>
                Some o relatório, todas as ocorrências registradas e a planilha. Sai também do histórico e do calendário. <span style={{ color: '#f87171' }}>Não tem como desfazer.</span>
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmDiscard(null)}>Cancelar</Button>
            <Button variant="danger" style={{ flex: 1 }} loading={deleteInspection.isPending}
              onClick={async () => {
                try {
                  await deleteInspection.mutateAsync(confirmDiscard.id);
                  toast('Vistoria descartada', 'info');
                  setConfirmDiscard(null);
                } catch (e) {
                  toast(e?.response?.data?.error?.message || 'Erro ao descartar', 'error');
                }
              }}>
              Descartar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={shareModal} onClose={() => setShareModal(false)} title="Compartilhar chave do prédio">
        <p className="text-[#9A9A9A] text-sm mb-4">Compartilhe esta chave com inspetores e visualizadores para que possam solicitar acesso.</p>
        <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-3">
          <span className="text-[#F5C518] font-mono text-sm tracking-widest break-all">{shareKey}</span>
          <button onClick={() => { navigator.clipboard.writeText(shareKey); toast('Chave copiada!', 'info'); }}
            className="text-xs text-[#9A9A9A] hover:text-white whitespace-nowrap border border-[#2A2A2A] rounded-lg px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
