'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Inbox, Send, Loader, CheckCheck } from 'lucide-react';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { HistoricoSwitcher, useHistoricoView } from '@/app/components/HistoricoSwitcher';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { useCalendar, useBuildingHistory, useTicketStats } from '@/app/hooks/useApi';
import { parseReportDate } from '@/app/lib/date';
import { T, R, W, NUM } from '@/app/lib/theme';

const STATUS_LABEL = { IN_PROGRESS: 'Em andamento', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { IN_PROGRESS: 'accent', COMPLETED: 'success' };

/** Um contador do painel: quantos chamados estão em cada ponto do caminho. */
function StatCard({ icon: Icon, label, value, isLoading, className = '' }) {
  return (
    <div className={className} style={{ background: T.card, borderRadius: 26, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, background: T.accentSoft, borderRadius: R.control, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={T.accent} />
      </div>
      <div>
        <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
        {isLoading ? (
          <Skeleton style={{ height: 24, width: 40, marginTop: 4 }} />
        ) : (
          <p style={{ color: T.text, fontSize: 22, fontWeight: W.title, ...NUM }}>{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

/**
 * O painel do moderador.
 *
 * É onde ele cai ao entrar, antes das telas de chamado: quantos chamados estão
 * em cada ponto do caminho, o histórico de relatórios do prédio — o mesmo do
 * inspetor e do visualizador — e o calendário do que aconteceu em cada dia.
 */
export default function ModeradorPage() {
  const { building, isLoading: buildingLoading } = useModeratorBuilding();
  const buildingId = building?.building_id;

  // Os dois históricos dividem o mesmo cartão, como no histórico do inspetor. A
  // visão mora aqui para o modal de relatório não levá-la junto ao fechar.
  const historico = useHistoricoView();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);
  const [reportId, setReportId] = useState(null);

  const { data: stats, isLoading: statsLoading } = useTicketStats(buildingId);
  const { data: calData, isLoading: calLoading } = useCalendar(
    buildingId ? { month, year, building_id: buildingId } : null
  );
  const { data: histData, isLoading: histLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useBuildingHistory(buildingId);

  const rows = histData?.pages?.flatMap((p) => p.inspections) ?? [];
  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  function prev() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  /**
   * O histórico de vistorias: a tabela de relatórios do prédio, como sempre
   * foi. Sai do meio do cartão para uma constante porque agora divide o
   * lugar com a lista de ocorrências, e as duas alternam por uma linha só.
   */
  const relatoriosPanel = (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {['Inspetor', 'Status', 'Dia', 'Planilha'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 11, fontWeight: W.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {histLoading && [1, 2, 3].map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
              {[1, 2, 3, 4].map((j) => (
                <td key={j} style={{ padding: '10px 22px' }}><Skeleton style={{ height: 14 }} /></td>
              ))}
            </tr>
          ))}

          {rows.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => setReportId(r.id)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={{ padding: '11px 22px', color: T.text, fontSize: 13 }}>{r.inspector?.name ?? '—'}</td>
              <td style={{ padding: '11px 22px' }}>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
              {/* Só o dia: a planilha e o relatório passaram a ser do dia */}
              <td style={{ padding: '11px 22px', color: T.mute, fontSize: 13 }}>
                {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
              </td>
              <td style={{ padding: '11px 22px' }}>
                {r.excel_url ? (
                  <a
                    href={r.excel_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.accent, fontSize: 13 }}
                  >
                    <Download size={13} /> Baixar
                  </a>
                ) : (
                  <span style={{ color: T.mute, fontSize: 13 }}>—</span>
                )}
              </td>
            </tr>
          ))}

          {!histLoading && rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '40px 22px', textAlign: 'center', color: T.mute, fontSize: 13 }}>
                Nenhuma vistoria neste prédio ainda
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {hasNextPage && (
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'center' }}>
          <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}
    </>
  );

  return (
    <ModeradorShell
      building={building}
      isLoading={buildingLoading}
      title="Painel"
      subtitle={building?.name}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Onde estão os chamados, na ordem do caminho que eles fazem.
            "Encaminhados" é contador próprio, e não parte de "em andamento":
            ninguém aceitou esses ainda, e somá-los ao que está sendo feito
            esconderia a fila que o moderador tem de cobrar. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard className="anim-fade-up anim-d1" icon={Inbox} label="Em aberto" value={stats?.abertos} isLoading={statsLoading} />
          <StatCard className="anim-fade-up anim-d2" icon={Send} label="Encaminhados" value={stats?.encaminhados} isLoading={statsLoading} />
          <StatCard className="anim-fade-up anim-d3" icon={Loader} label="Em andamento" value={stats?.em_andamento} isLoading={statsLoading} />
          <StatCard className="anim-fade-up anim-d4" icon={CheckCheck} label="Concluídos" value={stats?.concluidos} isLoading={statsLoading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }}>
          {/* Calendário: quantas vistorias em cada dia */}
          <div className="anim-fade-up anim-d5" style={{ background: T.card, borderRadius: 26, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={prev} aria-label="Mês anterior" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4, display: 'flex' }}>
                <ChevronLeft size={17} />
              </button>
              <span key={monthLabel} className="anim-fade-in" style={{ color: T.text, fontSize: 13, fontWeight: W.title, textTransform: 'capitalize' }}>
                {monthLabel}
              </span>
              <button onClick={next} aria-label="Próximo mês" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4, display: 'flex' }}>
                <ChevronRight size={17} />
              </button>
            </div>

            {calLoading ? (
              <Skeleton style={{ height: 190, width: '100%' }} />
            ) : (
              <CalendarHeatmap
                heatmap={calData?.heatmap ?? {}}
                month={month}
                year={year}
                onDayClick={(day, info) => setDayModal({ day, info })}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14, justifyContent: 'flex-end' }}>
              <span style={{ color: T.mute, fontSize: 11 }}>Menos</span>
              {['#232323', '#2E2A12', '#6B5A00', '#A88A00', '#F5C518'].map((c) => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
              ))}
              <span style={{ color: T.mute, fontSize: 11 }}>Mais</span>
            </div>
          </div>

          {/* Histórico — a mesma leitura das outras telas, e as mesmas duas
              visões: vistorias e ocorrências, alternadas pelas setas. */}
          <div className="anim-fade-up anim-d6" style={{ background: T.card, borderRadius: 26, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}` }}>
              <HistoricoSwitcher
                title={historico.title}
                subtitle={
                  historico.isVistorias
                    ? 'Clique numa linha para abrir o relatório completo do dia'
                    : 'O que as vistorias encontraram, da mais recente para a mais antiga'
                }
                onPrev={historico.prev}
                onNext={historico.next}
              />
            </div>

            {/* `key` na visão: só o conteúdo do cartão troca — os contadores e
                o calendário ficam onde estão. */}
            <div key={historico.view} className="anim-fade-up">
              {historico.isVistorias ? relatoriosPanel : <OcorrenciasTable buildingId={buildingId} />}
            </div>
          </div>
        </div>
      </div>

      <DayInspectionsModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        day={dayModal?.day}
        info={dayModal?.info}
      />

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />
    </ModeradorShell>
  );
}
