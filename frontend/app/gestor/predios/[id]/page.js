'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Share2, Download, Users, ClipboardList, Eye, UserCheck, UserMinus, AlertTriangle, Trash2, Check, X } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { GestorHeader } from '@/app/components/GestorHeader';
import { CalendarDayCell } from '@/app/components/CalendarDayCell';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Skeleton, Button, Modal, Select } from '@/app/components/ui';
import { useBuildingDashboard, useBuildingHistory, useBuildingMembers, useRemoveMember, useUpdateMemberRole, useDeleteInspection, useAccessRequests, useReviewAccessRequest } from '@/app/hooks/useApi';
import { formatShareKey } from '@/app/lib/shareKey';
import { useToastStore } from '@/app/store/toast';

const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Visualizador' },
  { value: 'INSPECTOR', label: 'Inspetor' },
  // Promover a gestor é como a gestão se divide ou se transfere. Um prédio pode
  // ter mais de um; o que ele não pode é ficar sem nenhum.
  { value: 'GESTOR', label: 'Gestor' },
];

const ROLE_TOAST = {
  GESTOR: 'Agora é gestor do prédio',
  INSPECTOR: 'Agora é inspetor',
  VIEWER: 'Agora é visualizador',
};

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success', COMPLETED: 'success' };

function intensity(count) {
  if (!count) return '#232323';
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
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.26)', fontWeight: 600, padding: '2px 0' }}>{d}</div>
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

/**
 * Linha de colaborador.
 *
 * O papel é decisão do gestor: quem se vincula entra como visualizador e sobe
 * daqui. O gestor aparece nesta mesma lista — ele é um vínculo como os outros,
 * e é isso que permite ter dois gestores ou passar a gestão adiante.
 *
 * `soleManager` marca o último gestor do prédio: rebaixá-lo ou removê-lo
 * deixaria o prédio sem ninguém que possa administrá-lo, então os dois
 * controles ficam travados (a API também recusa, com 409).
 */
function MemberRow({ member, buildingId, soleManager, onRemove, className = '' }) {
  const updateRole = useUpdateMemberRole();
  const { show: toast } = useToastStore();

  async function handleRoleChange(role) {
    try {
      await updateRole.mutateAsync({ buildingId, userId: member.user_id, role });
      toast(ROLE_TOAST[role], 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao alterar o papel', 'error', e);
    }
  }

  const travado = soleManager
    ? 'Este é o único gestor do prédio. Promova outro colaborador a gestor antes.'
    : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-control px-4 py-3 ${className}`}
      style={member.role === 'GESTOR'
        ? { background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.15)' }
        : { background: '#232323' }}
    >
      <Avatar user={member.user} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{member.user?.name}</p>
        <p className="text-mute text-xs truncate">{member.user?.email}</p>
      </div>
      {/* `raised` sobe o fundo um nível, porque a linha inteira já é chip */}
      <Select
        raised
        wrapperClassName="flex-shrink-0"
        wrapperStyle={{ width: 148, flexBasis: 148 }}
        style={{ padding: '7px 30px 7px 12px', fontSize: 12 }}
        aria-label={`Papel de ${member.user?.name} neste prédio`}
        title={travado ?? undefined}
        options={ROLE_OPTIONS}
        value={member.role}
        disabled={updateRole.isPending || soleManager}
        onChange={(e) => handleRoleChange(e.target.value)}
      />
      <button
        onClick={onRemove}
        disabled={soleManager}
        style={{ background: 'none', border: 'none', cursor: soleManager ? 'not-allowed' : 'pointer', color: 'rgba(255,255,255,0.26)', display: 'flex', padding: 4, borderRadius: 8, flexShrink: 0, opacity: soleManager ? 0.4 : 1 }}
        onMouseEnter={e => { if (!soleManager) e.currentTarget.style.color = '#f87171'; }}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.26)'}
        title={travado ?? 'Remover vínculo'}>
        <UserMinus size={15} />
      </button>
    </div>
  );
}

/** Uma solicitação pendente: quem pediu, quando, e as duas saídas. */
function RequestRow({ request, buildingId, className = '' }) {
  const review = useReviewAccessRequest();
  const { show: toast } = useToastStore();

  async function handle(status) {
    try {
      await review.mutateAsync({ buildingId, requestId: request.id, status });
      toast(
        status === 'APPROVED' ? 'Acesso aprovado! Entrou como visualizador.' : 'Solicitação rejeitada',
        status === 'APPROVED' ? 'success' : 'info'
      );
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao revisar solicitação', 'error', e);
    }
  }

  return (
    <div className={`flex items-center gap-3 bg-chip rounded-control px-4 py-3 ${className}`}>
      <Avatar user={request.user} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{request.user?.name}</p>
        <p className="text-mute text-xs truncate">{request.user?.email}</p>
      </div>
      <span className="text-faint text-xs whitespace-nowrap">
        {format(new Date(request.requested_at), 'dd/MM/yyyy', { locale: ptBR })}
      </span>
      <button
        onClick={() => handle('APPROVED')}
        disabled={review.isPending}
        title="Aprovar"
        aria-label={`Aprovar ${request.user?.name}`}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-accent text-black transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
      >
        <Check size={13} /> Aprovar
      </button>
      <button
        onClick={() => handle('REJECTED')}
        disabled={review.isPending}
        title="Rejeitar"
        aria-label={`Rejeitar ${request.user?.name}`}
        className="flex items-center justify-center w-8 h-8 rounded-pill bg-card text-danger transition-all duration-150 hover:scale-110 active:scale-95 disabled:opacity-50 flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function GestorBuildingPage() {
  const { id } = useParams();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [membersModal, setMembersModal] = useState(false);
  const [requestsModal, setRequestsModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // membro a remover
  const [confirmDiscard, setConfirmDiscard] = useState(null); // vistoria a descartar
  const [previewId, setPreviewId] = useState(null); // vistoria em prévia
  const [reportId, setReportId] = useState(null); // relatório completo aberto

  const { data, isLoading } = useBuildingDashboard(id);
  const { data: histData, isLoading: histLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useBuildingHistory(id);
  const { data: membersData, isLoading: membersLoading } = useBuildingMembers(membersModal ? id : null);
  // Buscado sempre, e não só com o modal aberto: sem isso o gestor teria de
  // abrir a caixa para descobrir que existe alguém esperando aprovação.
  const { data: requests = [], isLoading: requestsLoading } = useAccessRequests(id);
  const removeMember = useRemoveMember();
  const deleteInspection = useDeleteInspection();
  const { show: toast } = useToastStore();
  const members = membersData ?? [];
  const managerCount = members.filter((m) => m.role === 'GESTOR').length;
  const rows = histData?.pages?.flatMap((p) => p.inspections) ?? [];

  const heatmap = data?.heatmap ?? {};
  const shareKey = formatShareKey(data?.building?.share_key);
  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  function prev() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  return (
    <RouteGuard manages={id}>
      <div className="hidden lg:flex flex-col min-h-screen bg-page">
        <GestorHeader back="/gestor" />
        <main className="flex-1 p-8 overflow-auto">

          {/* Header */}
          <div className="anim-fade-down flex items-center justify-between mb-8">
            <div>
              {isLoading ? <div className="h-7 w-48 bg-chip rounded animate-pulse" /> : (
                <h1 className="text-2xl font-semibold text-white">{data?.building?.name}</h1>
              )}
              {data?.building?.description && (
                <p className="text-mute text-sm mt-0.5">{data.building.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setRequestsModal(true)}
                className="relative flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-white transition-colors">
                <Users size={15} /> Solicitações
                {requests.length > 0 && (
                  <span className="anim-pop-in flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent text-black text-xs font-semibold">
                    {requests.length}
                  </span>
                )}
              </button>
              <button onClick={() => setMembersModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-white transition-colors">
                <UserCheck size={15} /> Colaboradores
              </button>
              <button onClick={() => setShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-white transition-colors">
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
              <div key={label} className={`anim-fade-up anim-d${idx + 1} bg-card rounded-card p-5 flex items-center gap-4 transition-all duration-200`}>
                <div className="w-10 h-10 bg-accent-soft rounded-control flex items-center justify-center">
                  <Icon size={18} className="text-accent" />
                </div>
                <div>
                  <p className="text-mute text-xs">{label}</p>
                  {isLoading ? <div className="h-6 w-12 bg-chip rounded animate-pulse mt-1" /> : (
                    <p className="text-white text-xl font-semibold">{value ?? 0}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Calendário + Histórico */}
          <div className="anim-fade-up anim-d4 grid grid-cols-3 gap-6">
            <div className="col-span-1 bg-card rounded-card p-5">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prev} className="p-1 text-mute hover:text-white"><ChevronLeft size={16} /></button>
                <span className="text-white text-sm font-semibold capitalize">{monthLabel}</span>
                <button onClick={next} className="p-1 text-mute hover:text-white"><ChevronRight size={16} /></button>
              </div>
              <MonthGrid heatmap={heatmap} year={year} month={month} onDayClick={(day, info) => setSelected({ day, info })} />
              <div className="flex items-center gap-1 mt-4 justify-end">
                <span className="text-mute text-xs">Menos</span>
                {['#232323','#2E2A12','#6B5A00','#A88A00','#F5C518'].map((c, i) => (
                  <div key={i} style={{ background: c }} className="w-3 h-3 rounded-sm" />
                ))}
                <span className="text-mute text-xs">Mais</span>
              </div>
            </div>

            <div className="col-span-2 bg-card rounded-card overflow-hidden">
              <div className="px-6 py-4 border-b border-line">
                <h2 className="text-white font-semibold">Histórico de Inspeções</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line">
                    {['Inspetor', 'Status', 'Data', 'Planilha', ''].map((h, i) => (
                      <th key={i} className="text-left px-6 py-3 text-mute text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histLoading && [1,2,3].map(i => (
                    <tr key={i} className="border-b border-line">
                      {[1,2,3,4,5].map(j => <td key={j} className="px-6 py-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))}
                  {rows.map(r => (
                    <tr key={r.id} onClick={() => setReportId(r.id)}
                      className="border-b border-line hover:bg-chip transition-colors cursor-pointer">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar user={r.inspector} size={28} />
                          <span className="text-white text-sm">{r.inspector?.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-6 py-3 text-mute text-sm">
                        {format(new Date(r.finished_at || r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-4">
                          {r.excel_url ? (
                            <a href={r.excel_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-accent text-sm hover:underline">
                              <Download size={13} /> Baixar
                            </a>
                          ) : <span className="text-mute text-sm">—</span>}
                          <button onClick={e => { e.stopPropagation(); setPreviewId(r.id); }}
                            className="flex items-center gap-1 text-mute text-sm hover:text-white transition-colors">
                            <Eye size={13} /> Prévia
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDiscard(r); }}
                          disabled={deleteInspection.isPending}
                          title="Descartar vistoria"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.26)', padding: 4, borderRadius: 8 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.26)'}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!histLoading && rows.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-mute text-sm">Nenhuma inspeção encontrada</td></tr>
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
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div><p className="text-4xl mb-4">🖥️</p><p className="text-white font-semibold">Acesse pelo computador</p></div>
      </div>

      <DayInspectionsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        day={selected?.day}
        info={selected?.info}
      />

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />

      <Modal open={membersModal} onClose={() => setMembersModal(false)} title="Colaboradores" maxWidth={560}>
        <div className="flex flex-col gap-2">
          {membersLoading ? (
            [1,2,3].map(i => <div key={i} className="h-12 bg-chip rounded-control animate-pulse" />)
          ) : members.length === 0 ? (
            <p className="text-mute text-sm text-center py-6">Ninguém vinculado a este prédio</p>
          ) : (
            members.map((m, idx) => (
              <MemberRow
                key={m.id}
                member={m}
                buildingId={id}
                soleManager={m.role === 'GESTOR' && managerCount === 1}
                className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
                onRemove={() => setConfirmRemove(m)}
              />
            ))
          )}
        </div>
        <p className="text-faint text-xs mt-4 leading-relaxed">
          Um prédio pode ter mais de um gestor — é assim que a gestão se divide ou passa adiante.
          O que ele não pode é ficar sem nenhum.
        </p>
      </Modal>

      <Modal open={requestsModal} onClose={() => setRequestsModal(false)} title="Solicitações de acesso" maxWidth={560}>
        {requestsLoading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-card rounded-control animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <p className="text-mute text-sm text-center py-6">Nenhuma solicitação pendente</p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r, idx) => (
              <RequestRow
                key={r.id}
                request={r}
                buildingId={id}
                className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
              />
            ))}
          </div>
        )}
        <p className="text-faint text-xs mt-4 leading-relaxed">
          Quem é aprovado entra como visualizador. O papel dele muda em Colaboradores.
        </p>
      </Modal>

      {/* Confirmação de desvinculo */}
      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remover colaborador">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: 'rgba(255,255,255,0.96)', fontSize: 14, lineHeight: 1.6 }}>
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
            <div style={{ color: 'rgba(255,255,255,0.96)', fontSize: 14, lineHeight: 1.6 }}>
              <p>
                Descartar a vistoria de <span style={{ color: '#fff', fontWeight: 600 }}>{confirmDiscard?.inspector?.name}</span>
                {confirmDiscard && ` de ${format(new Date(confirmDiscard.finished_at || confirmDiscard.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}?
              </p>
              <p style={{ marginTop: 10, color: 'rgba(255,255,255,0.44)' }}>
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
        <p className="text-mute text-sm mb-4">Compartilhe esta chave com inspetores e visualizadores para que possam solicitar acesso.</p>
        <div className="bg-chip rounded-control p-4 flex items-center justify-between gap-3">
          <span className="text-accent font-semibold text-sm break-all" style={{ letterSpacing: "0.18em" }}>{shareKey}</span>
          <button onClick={() => { navigator.clipboard.writeText(shareKey); toast('Chave copiada!', 'info'); }}
            className="text-xs text-mute hover:text-white whitespace-nowrap rounded-pill px-3 py-1.5 transition-colors">
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
