'use client';
import { useId } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { Button, Dialog, Spinner } from '@/app/components/ui';
import { useDayReport, useGenerateExcel } from '@/app/hooks/useApi';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { parseReportDate } from '@/app/lib/date';
import { MAINTENANCE_TYPES, CATEGORIES, PRIORITIES, RECORD_STATUS, labelOf } from '@/app/lib/maintenanceOptions';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

// Folha do documento: mesma paleta do app, com cara de impresso — tipografia e filete.
const PAPER = T.card;
const INK = T.text;
const INK_SOFT = T.mute;
const RULE = T.line;

const D = {
  sheet: { background: PAPER, padding: '48px 56px 56px', color: INK, fontSize: 14, lineHeight: 1.65 },
  eyebrow: { fontSize: 12, color: INK_SOFT, fontWeight: W.body },
  title: { fontSize: 26, fontWeight: W.title, letterSpacing: '-0.015em', marginTop: 6, color: INK },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 32px', marginTop: 24 },
  metaLabel: { fontSize: 12, color: INK_SOFT, fontWeight: W.body },
  metaValue: { fontSize: 14, color: INK, marginTop: 2, fontWeight: W.strong },
  rule: { border: 'none', borderTop: `1px solid ${RULE}`, margin: '28px 0 0' },
  floorTitle: { fontSize: 17, fontWeight: W.title, color: INK },
  th: { textAlign: 'left', padding: '8px 12px 8px 0', fontSize: 12, color: INK_SOFT, fontWeight: W.body, borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px 10px 0', fontSize: 14, color: INK, borderBottom: `1px solid ${RULE}`, verticalAlign: 'top' },
  empty: { fontSize: 14, color: INK_SOFT, marginTop: 8 },
};

const FLOOR_STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };
const FLOOR_STATUS_COLOR = { OK: INK_SOFT, ATENCAO: T.accentInk, PROBLEMA: T.danger };
/** Fundo do selo de andar no telefone — o mesmo tom da cor, rebaixado. */
const FLOOR_STATUS_TINT = {
  OK: T.chip,
  ATENCAO: 'rgba(245,197,24,0.12)',
  PROBLEMA: 'rgba(248,113,113,0.12)',
};
const PRIORITY_COLOR = { ALTA: T.danger, MEDIA: T.accentInk, BAIXA: INK_SOFT };

/** Selo de situação do andar, igual nas duas versões da folha. */
function FloorStatus({ value, pill = false }) {
  const color = FLOOR_STATUS_COLOR[value] ?? INK_SOFT;
  const base = {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color, whiteSpace: 'nowrap',
  };

  // Na folha larga o filete e o espaço já separam; no telefone a linha do andar
  // divide espaço com o rótulo e precisa de superfície para se destacar.
  if (!pill) return <span style={base}>{FLOOR_STATUS_LABEL[value] ?? value}</span>;

  return (
    <span style={{
      ...base,
      padding: '4px 10px', borderRadius: 999,
      background: FLOOR_STATUS_TINT[value] ?? T.chip,
    }}>
      {FLOOR_STATUS_LABEL[value] ?? value}
    </span>
  );
}

/** Folha larga: uma tabela por andar. */
function DesktopSheet({ report, entries, totalRecords }) {
  return (
    <div style={D.sheet}>
      <p style={D.eyebrow}>Relatório do dia</p>
      <h1 style={D.title}>{report.building?.name}</h1>

      <div style={D.metaGrid}>
        <div>
          <p style={D.metaLabel}>Dia</p>
          <p style={D.metaValue}>{format(parseReportDate(report.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <div>
          {/* Os nomes separados por barra: o relatório é do dia, e o dia pode
              ter tido mais de uma vistoria, de gente diferente. */}
          <p style={D.metaLabel}>Inspeção feita por</p>
          <p style={D.metaValue}>{(report.inspectors ?? []).join(' / ') || '—'}</p>
        </div>
        <div>
          <p style={D.metaLabel}>Andares vistoriados</p>
          <p style={D.metaValue}>{entries.length}</p>
        </div>
        <div>
          <p style={D.metaLabel}>Ocorrências</p>
          <p style={D.metaValue}>{totalRecords}</p>
        </div>
      </div>

      <hr style={D.rule} />

      {entries.map((entry) => {
        const records = entry.maintenance_records ?? [];
        return (
          <section key={entry.floor_id} style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={D.floorTitle}>{entry.floor?.label}</h2>
              <FloorStatus value={entry.status_geral} />
            </div>

            {records.length === 0 ? (
              <p style={D.empty}>Nada a relatar neste andar.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...D.th, width: 150 }}>Tipo</th>
                    <th style={{ ...D.th, width: 110 }}>Categoria</th>
                    <th style={{ ...D.th, width: 90 }}>Prioridade</th>
                    <th style={D.th}>Descrição</th>
                    <th style={{ ...D.th, width: 100 }}>Responsável</th>
                    <th style={{ ...D.th, width: 130 }}>Status</th>
                    <th style={{ ...D.th, width: 110 }}>Relatado por</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, i) => (
                    <tr key={record.id ?? i}>
                      <td style={D.td}>{labelOf(MAINTENANCE_TYPES, record.maintenance_type)}</td>
                      <td style={D.td}>{labelOf(CATEGORIES, record.category)}</td>
                      <td style={{ ...D.td, color: PRIORITY_COLOR[record.priority] ?? INK, fontWeight: record.priority === 'ALTA' ? 700 : 400 }}>
                        {labelOf(PRIORITIES, record.priority)}
                      </td>
                      <td style={{ ...D.td, whiteSpace: 'pre-wrap' }}>{record.description}</td>
                      <td style={D.td}>{record.responsible ?? 'A encaminhar'}</td>
                      <td style={D.td}>{labelOf(RECORD_STATUS, record.status)}</td>
                      <td style={D.td}>{record.inspector ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <hr style={{ ...D.rule, marginTop: 40 }} />
      {/* Sem hora: a unidade do relatório é o dia. */}
      <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 12 }}>
        {report.reports?.length ?? 1} vistoria{(report.reports?.length ?? 1) !== 1 ? 's' : ''} neste dia · Viston
      </p>
    </div>
  );
}

/**
 * Uma ocorrência no telefone.
 *
 * A tabela de seis colunas do desktop não cabe em 360px: ela encolhe até a
 * descrição virar uma coluna de duas palavras por linha. Aqui cada ocorrência é
 * um bloco — tipo e prioridade na primeira linha, descrição inteira em seguida,
 * e o resto como rodapé, que é a ordem em que a informação é procurada.
 */
function MobileRecord({ record }) {
  const priorityColor = PRIORITY_COLOR[record.priority] ?? INK_SOFT;

  return (
    <div style={{ position: 'relative', background: T.chip, borderRadius: R.control, padding: '14px 14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
      {/* Filete na borda esquerda com a cor da prioridade: dá para varrer a
          lista e achar o que é grave sem ler nenhuma palavra. */}
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: priorityColor }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: W.title, color: INK }}>
          {labelOf(MAINTENANCE_TYPES, record.maintenance_type)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: priorityColor }}>
          {labelOf(PRIORITIES, record.priority)}
        </span>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.6, color: INK, whiteSpace: 'pre-wrap' }}>
        {record.description}
      </p>

      <p style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.5 }}>
        {labelOf(CATEGORIES, record.category)} · {record.responsible ?? 'A encaminhar'} ·{' '}
        {labelOf(RECORD_STATUS, record.status)}
        {record.inspector ? ` · relatado por ${record.inspector}` : ''}
      </p>
    </div>
  );
}

/** Folha do telefone: sem tabela, um bloco por ocorrência. */
function MobileSheet({ report, entries, totalRecords }) {
  const problemas = entries.filter((e) => e.status_geral === 'PROBLEMA').length;

  return (
    <div style={{ background: PAPER, padding: '24px 18px 40px', color: INK }}>
      {/* Sem repetir "Relatório de vistoria": a barra logo acima já diz isso, e
          no telefone as duas linhas ficam a um dedo de distância. */}
      <h1 style={{ fontSize: 22, fontWeight: W.title, letterSpacing: '-0.015em', lineHeight: 1.25 }}>
        {report.building?.name}
      </h1>
      <p style={{ fontSize: 14, color: INK_SOFT, marginTop: 6, lineHeight: 1.5 }}>
        {format(parseReportDate(report.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>
      <p style={{ fontSize: 14, color: INK_SOFT, marginTop: 2 }}>
        Por {(report.inspectors ?? []).join(' / ') || '—'}
      </p>

      {/* Três números, como o resto do mobile mostra resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '18px 0 4px' }}>
        {[
          [entries.length, 'Andares'],
          [totalRecords, 'Ocorrências'],
          [problemas, 'Problemas'],
        ].map(([value, label]) => (
          <div key={label} style={{ background: T.chip, borderRadius: R.control, padding: '12px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 20, fontWeight: W.title, lineHeight: 1.1 }}>{value}</p>
            <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 3 }}>{label}</p>
          </div>
        ))}
      </div>

      {entries.map((entry) => {
        const records = entry.maintenance_records ?? [];
        return (
          <section key={entry.floor_id} style={{ marginTop: 22 }}>
            {/* Gruda no topo enquanto o andar rola: em relatório longo, some a
                dúvida de qual andar é a ocorrência que está na tela. */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 1, background: PAPER,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '10px 0', borderBottom: `1px solid ${RULE}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 16, fontWeight: W.title, lineHeight: 1.2 }}>{entry.floor?.label}</h2>
                <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>
                  {records.length === 0
                    ? 'Sem ocorrências'
                    : `${records.length} ocorrência${records.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <FloorStatus value={entry.status_geral} pill />
            </div>

            {records.length === 0 ? (
              <p style={{ fontSize: 14, color: INK_SOFT, padding: '14px 0 2px' }}>
                Nada a relatar neste andar.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {records.map((record, i) => (
                  <MobileRecord key={record.id ?? i} record={record} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div style={{ marginTop: 30, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.6 }}>
          {report.reports?.length ?? 1} vistoria{(report.reports?.length ?? 1) !== 1 ? 's' : ''}<br />
          neste dia
        </p>
        <Logo size={12} style={{ color: T.faint }} />
      </div>
    </div>
  );
}

/**
 * O relatório completo, em folha de documento dentro de um modal.
 *
 * O `reportId` continua sendo o de uma vistoria — é o que a linha do histórico
 * tem —, mas o que abre é o documento do dia dela: se três pessoas vistoriaram
 * o prédio naquela data, as três estão aqui, e o cabeçalho traz os três nomes.
 */
export function ReportDocumentModal({ open, onClose, reportId }) {
  const { mounted, closing } = useExitTransition(open);
  const titleId = useId();
  // Segura o id na saída para a folha não esvaziar antes da animação acabar
  const shownId = useKeepWhileClosing(reportId, open);
  const { data: report, isLoading } = useDayReport(mounted ? shownId : null);
  const generateExcel = useGenerateExcel();
  const { show: toast } = useToastStore();
  const { download, pendingId } = useExcelDownload();
  const isDesktop = useIsDesktop();

  if (!mounted) return null;

  const entries = sortFloorsDesc(
    (report?.floor_form_entries ?? []).map((e) => ({ ...e, label: e.floor?.label ?? '' }))
  );
  const totalRecords = entries.reduce((sum, e) => sum + (e.maintenance_records?.length ?? 0), 0);

  async function handleGenerate() {
    try {
      const { excel_url } = await generateExcel.mutateAsync(shownId);
      toast('Planilha gerada!', 'success');
      // A URL vem assinada e vale minutos: a planilha desce agora, não depois.
      if (excel_url) window.location.href = excel_url;
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao gerar planilha', 'error');
    }
  }

  // No telefone o relatório ocupa a tela inteira: sobra de margem só encolhe a
  // única coisa que interessa aqui, que é o texto da ocorrência.
  const shellStyle = isDesktop
    ? { width: 1000, maxHeight: '92vh', borderRadius: R.control }
    : { width: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0 };

  return (
    <Dialog
      onClose={onClose}
      className={`${closing ? 'is-closing' : ''} ${isDesktop ? '' : 'dialog--full'}`}
      labelledBy={titleId}
      style={isDesktop ? { width: 1000 } : { width: '100vw', maxWidth: '100vw', height: '100vh' }}
    >
      <div className={closing ? 'anim-scale-out' : 'anim-scale-in'} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', ...shellStyle }}>
        {/* Barra de ações — fora da folha, para o documento ficar limpo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: isDesktop ? '12px 16px' : '14px 14px 14px 18px', background: T.bg, borderBottom: `1px solid ${RULE}`, flexShrink: 0 }}>
          <span id={titleId} style={{ color: T.mute, fontSize: 12, fontWeight: W.body }}>
            Relatório do dia
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 8 : 4 }}>
            {report?.has_excel ? (
              isDesktop ? (
                <Button
                  variant="secondary"
                  onClick={() => download(shownId)}
                  loading={pendingId === shownId}
                  aria-label="Baixar planilha"
                  title="Baixar planilha"
                  style={{ fontSize: 12, padding: '7px 13px' }}
                >
                  <Download size={13} /> Baixar planilha
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => download(shownId)}
                  disabled={pendingId === shownId}
                  aria-label="Baixar planilha"
                  title="Baixar planilha"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: R.control, border: 'none', cursor: 'pointer', background: T.chip, color: T.accentInk }}
                >
                  <Download size={18} />
                </button>
              )
            ) : report ? (
              <Button
                onClick={handleGenerate}
                loading={generateExcel.isPending}
                aria-label="Gerar planilha"
                title="Gerar planilha"
                style={isDesktop ? { fontSize: 12, padding: '7px 13px' } : { width: 40, height: 40, padding: 0 }}
              >
                <FileSpreadsheet size={isDesktop ? 13 : 17} />
                {isDesktop && ' Gerar planilha'}
              </Button>
            ) : null}
            <button
              onClick={onClose}
              aria-label="Fechar relatório"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: isDesktop ? 4 : 10, display: 'flex' }}
            >
              <X size={isDesktop ? 18 : 20} />
            </button>
          </div>
        </div>

        {/* Folha */}
        <div style={{ overflowY: 'auto', background: PAPER, flex: 1 }}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner /></div>
          )}

          {report && (
            isDesktop
              ? <DesktopSheet report={report} entries={entries} totalRecords={totalRecords} />
              : <MobileSheet report={report} entries={entries} totalRecords={totalRecords} />
          )}
        </div>
      </div>
    </Dialog>
  );
}
