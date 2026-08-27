'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Share2, Download, Users, ClipboardList, Eye, Trash2, AlertTriangle } from 'lucide-react';
import { Avatar } from '@/app/components/Avatar';
import { GestorShell } from '@/app/components/GestorShell';
import { CalendarDayCell } from '@/app/components/CalendarDayCell';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Skeleton, Button, Modal } from '@/app/components/ui';
import { HistoricoSwitcher, useHistoricoView } from '@/app/components/HistoricoSwitcher';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingDashboard, useBuildingHistory, useDeleteInspection } from '@/app/hooks/useApi';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { formatShareKey } from '@/app/lib/shareKey';
import { parseReportDate } from '@/app/lib/date';
import { placeholderCellHeight } from '@/app/lib/pagination';
import { useToastStore } from '@/app/store/toast';

// A célula de espera tem a altura da de verdade. Aqui o mais alto não é o
// `Badge`, e sim o `Avatar` de 28px da coluna de inspetor; o recuo é o `py-3`.
const PLACEHOLDER_CELL_H = placeholderCellHeight({ content: 28, padY: 12 });

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
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.52)', fontWeight: 600, padding: '2px 0' }}>{d}</div>
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
 * O painel do prédio.
 *
 * É a primeira aba da barra lateral, e ficou só com o que é leitura do prédio:
 * os números, o calendário e o histórico. Quem está no prédio — e quem pediu
 * para entrar — mudou-se para a aba de colaboradores, que é onde essas duas
 * coisas são trabalho, e não informação de passagem.
 */
export default function GestorBuildingPage() {
  const { download, pendingId } = useExcelDownload();
  const { id } = useParams();

  // O mesmo cartão de histórico do painel do moderador e do histórico do
  // inspetor: duas visões, alternadas pelas setas. A escolha mora aqui para os
  // modais do prédio não a levarem junto ao fechar.
  const historico = useHistoricoView();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selected, setSelected] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null); // vistoria a descartar
  const [previewId, setPreviewId] = useState(null); // vistoria em prévia
  const [reportId, setReportId] = useState(null); // relatório completo aberto

  const { data, isLoading } = useBuildingDashboard(id);
  // Oito por página: quem anda pelo resto é o rodapé de setas do cartão.
  const vistorias = useBuildingHistory(id);
  const deleteInspection = useDeleteInspection();
  const { show: toast } = useToastStore();
  // Enquanto a próxima página não chega, a que está saindo deixa a tela: o que
  // se vê é esqueleto, e não uma lista velha passando por nova (ver
  // `usePagedList`).
  const rows = vistorias.isPaging ? [] : vistorias.rows;
  const histLoading = vistorias.isLoading;

  const heatmap = data?.heatmap ?? {};
  const shareKey = formatShareKey(data?.building?.share_key);
  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  function prev() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  /**
   * O histórico de vistorias do prédio: a tabela de sempre, com a prévia,
   * a planilha e o descarte. Sai do meio do cartão para uma constante
   * porque agora divide o lugar com a lista de ocorrências.
   */
  const inspecoesPanel = (
    <>
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            {['Inspetor', 'Status', 'Dia', 'Planilha', ''].map((h, i) => (
              <th key={i} className="text-left px-6 py-3 text-mute text-xs font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        {/* `key` na página: as linhas entram de novo a cada seta. */}
        <tbody key={vistorias.page}>
          {vistorias.placeholders.map(i => (
            <tr key={i} className="border-b border-line">
              {[1,2,3,4,5].map(j => (
                <td key={j} className="px-6 py-3" style={{ height: PLACEHOLDER_CELL_H }}>
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
          {rows.map((r, idx) => (
            <tr key={r.id} onClick={() => setReportId(r.id)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} border-b border-line hover:bg-chip transition-colors cursor-pointer`}>
              <td className="px-6 py-3">
                <div className="flex items-center gap-2">
                  <Avatar user={r.inspector} size={28} />
                  <span className="text-white text-sm">{r.inspector?.name}</span>
                </div>
              </td>
              <td className="px-6 py-3">
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
              {/* Só o dia: o relatório completo e a planilha são do dia */}
              <td className="px-6 py-3 text-mute text-sm">
                {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-4">
                  {r.has_excel ? (
                    <button type="button" onClick={e => { e.stopPropagation(); download(r.id); }} disabled={pendingId === r.id}
                      className="flex items-center gap-1 text-accent text-sm hover:underline disabled:opacity-50">
                      <Download size={13} /> Baixar
                    </button>
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.52)', padding: 4, borderRadius: 8 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.52)'}>
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
          {!histLoading && !vistorias.isPaging && rows.length === 0 && (
            <tr><td colSpan={5} className="px-6 py-10 text-center text-mute text-sm">Nenhuma inspeção encontrada</td></tr>
          )}
        </tbody>
      </table>
      <Paginator
        page={vistorias.page}
        pages={vistorias.pages}
        total={vistorias.total}
        count={vistorias.rows.length}
        pageSize={vistorias.pageSize}
        onPrev={vistorias.prev}
        onNext={vistorias.next}
        isFetching={vistorias.isFetching}
        className="border-t border-line"
        style={{ padding: '12px 24px' }}
      />
    </>
  );

  return (
    <GestorShell
      buildingId={id}
      actions={
        <button onClick={() => setShareModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-white transition-colors flex-shrink-0">
          <Share2 size={15} /> Compartilhar ID
        </button>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
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

        {/* Calendário + Histórico.

            `items-start`: sem ele o grid estica as duas colunas até a altura da
            mais alta, e o cartão do calendário — que tem altura própria, dada
            pelas semanas do mês — ganhava um vão de fundo vazio embaixo da
            legenda, do tamanho do que sobrava da tabela ao lado. É o mesmo
            ajuste que o painel do moderador já faz. */}
        <div className="anim-fade-up anim-d4 grid grid-cols-3 gap-6 items-start">
          <div className="col-span-1 bg-card rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prev} className="p-1 text-mute hover:text-white"><ChevronLeft size={16} /></button>
              <span key={monthLabel} className="anim-fade-in text-white text-sm font-semibold capitalize">{monthLabel}</span>
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
              <HistoricoSwitcher
                title={historico.title}
                onPrev={historico.prev}
                onNext={historico.next}
              />
            </div>

            {/* `key` na visão: só o miolo do cartão troca — o calendário ao
                lado e o resto da tela do prédio ficam onde estão. */}
            <div key={historico.view} className="anim-fade-up">
              {historico.isVistorias ? inspecoesPanel : <OcorrenciasTable buildingId={id} />}
            </div>
          </div>
        </div>
      </div>

      <DayInspectionsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        day={selected?.day}
        info={selected?.info}
      />

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />

      {/* Confirmação de descarte da vistoria */}
      <Modal open={!!confirmDiscard} onClose={() => setConfirmDiscard(null)} title="Descartar vistoria">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ color: 'rgba(255,255,255,0.96)', fontSize: 14, lineHeight: 1.6 }}>
              <p>
                Descartar a vistoria de <span style={{ color: '#fff', fontWeight: 600 }}>{confirmDiscard?.inspector?.name}</span>
                {confirmDiscard && ` de ${format(parseReportDate(confirmDiscard.date), 'dd/MM/yyyy', { locale: ptBR })}`}?
              </p>
              <p style={{ marginTop: 10, color: 'rgba(255,255,255,0.68)' }}>
                Some o relatório e todas as ocorrências registradas — inclusive os chamados abertos por elas. Sai do histórico e do calendário, e a planilha do dia é refeita com o que sobrar. <span style={{ color: '#f87171' }}>Não tem como desfazer.</span>
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
    </GestorShell>
  );
}
