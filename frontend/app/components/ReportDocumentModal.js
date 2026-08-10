'use client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { Button, Spinner } from '@/app/components/ui';
import { useInspection, useGenerateExcel } from '@/app/hooks/useApi';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
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
  eyebrow: { fontSize: 11, color: INK_SOFT, fontWeight: W.body },
  title: { fontSize: 26, fontWeight: W.title, letterSpacing: '-0.015em', marginTop: 6, color: INK },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 32px', marginTop: 24 },
  metaLabel: { fontSize: 11, color: INK_SOFT, fontWeight: W.body },
  metaValue: { fontSize: 14, color: INK, marginTop: 2, fontWeight: W.strong },
  rule: { border: 'none', borderTop: `1px solid ${RULE}`, margin: '28px 0 0' },
  floorTitle: { fontSize: 17, fontWeight: W.title, color: INK },
  th: { textAlign: 'left', padding: '8px 12px 8px 0', fontSize: 11, color: INK_SOFT, fontWeight: W.body, borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px 10px 0', fontSize: 13, color: INK, borderBottom: `1px solid ${RULE}`, verticalAlign: 'top' },
  empty: { fontSize: 13, color: INK_SOFT, marginTop: 8 },
};

const FLOOR_STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };
const FLOOR_STATUS_COLOR = { OK: INK_SOFT, ATENCAO: T.accent, PROBLEMA: T.danger };
/** Fundo do selo de andar no telefone — o mesmo tom da cor, rebaixado. */
const FLOOR_STATUS_TINT = {
  OK: 'rgba(255,255,255,0.06)',
  ATENCAO: 'rgba(245,197,24,0.12)',
  PROBLEMA: 'rgba(248,113,113,0.12)',
};
const PRIORITY_COLOR = { ALTA: T.danger, MEDIA: T.accent, BAIXA: INK_SOFT };

/** Selo de situação do andar, igual nas duas versões da folha. */
function FloorStatus({ value, pill = false }) {
  const color = FLOOR_STATUS_COLOR[value] ?? INK_SOFT;
  const base = {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
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

/** Folha larga: uma tabela por andar, seis colunas. */
function DesktopSheet({ report, entries, totalRecords }) {
  return (
    <div style={D.sheet}>
      <p style={D.eyebrow}>Relatório de vistoria</p>
      <h1 style={D.title}>{report.building?.name}</h1>

      <div style={D.metaGrid}>
        <div>
          <p style={D.metaLabel}>Data de abertura</p>
          <p style={D.metaValue}>{format(parseReportDate(report.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <div>
          <p style={D.metaLabel}>Responsável pela vistoria</p>
          <p style={D.metaValue}>{report.inspector?.name ?? 'Usuário removido'}</p>
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
                      <td style={D.td}>{record.responsible}</td>
                      <td style={D.td}>{labelOf(RECORD_STATUS, record.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <hr style={{ ...D.rule, marginTop: 40 }} />
      <p style={{ fontSize: 11, color: INK_SOFT, marginTop: 12 }}>
        Vistoria concluída em{' '}
        {report.finished_at ? format(new Date(report.finished_at), "d/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'} · Viston
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
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: priorityColor }}>
          {labelOf(PRIORITIES, record.priority)}
        </span>
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.6, color: INK, whiteSpace: 'pre-wrap' }}>
        {record.description}
      </p>

      <p style={{ fontSize: 11, color: INK_SOFT, lineHeight: 1.5 }}>
        {labelOf(CATEGORIES, record.category)} · {record.responsible} · {labelOf(RECORD_STATUS, record.status)}
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
      <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 6, lineHeight: 1.5 }}>
        {format(parseReportDate(report.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>
      <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 2 }}>
        Por {report.inspector?.name ?? 'Usuário removido'}
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
            <p style={{ fontSize: 11, color: INK_SOFT, marginTop: 3 }}>{label}</p>
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
                <p style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>
                  {records.length === 0
                    ? 'Sem ocorrências'
                    : `${records.length} ocorrência${records.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <FloorStatus value={entry.status_geral} pill />
            </div>

            {records.length === 0 ? (
              <p style={{ fontSize: 13, color: INK_SOFT, padding: '14px 0 2px' }}>
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
        <p style={{ fontSize: 11, color: INK_SOFT, lineHeight: 1.6 }}>
          Vistoria concluída em<br />
          {report.finished_at ? format(new Date(report.finished_at), "d/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
        </p>
        <Logo size={12} style={{ color: T.faint, WebkitTextStroke: '0px' }} />
      </div>
    </div>
  );
}

/** Relatório completo da vistoria, em folha de documento dentro de um modal. */
export function ReportDocumentModal({ open, onClose, reportId }) {
  const { mounted, closing } = useExitTransition(open);
  // Segura o id na saída para a folha não esvaziar antes da animação acabar
  const shownId = useKeepWhileClosing(reportId, open);
  const { data: report, isLoading } = useInspection(mounted ? shownId : null);
  const generateExcel = useGenerateExcel();
  const { show: toast } = useToastStore();
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
      if (excel_url) window.open(excel_url, '_blank', 'noreferrer');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao gerar planilha', 'error');
    }
  }

  // No telefone o relatório ocupa a tela inteira: sobra de margem só encolhe a
  // única coisa que interessa aqui, que é o texto da ocorrência.
  const shellStyle = isDesktop
    ? { width: '100%', maxWidth: 1000, maxHeight: '92vh', borderRadius: R.control }
    : { width: '100%', height: '100%', maxHeight: '100%', borderRadius: 0 };

  return (
    <div
      className={closing ? 'anim-fade-out' : 'anim-fade-in'}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDesktop ? 20 : 0 }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />

      <div className={closing ? 'anim-scale-out' : 'anim-scale-in'} style={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...shellStyle }}>
        {/* Barra de ações — fora da folha, para o documento ficar limpo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: isDesktop ? '12px 16px' : '14px 14px 14px 18px', background: T.bg, borderBottom: `1px solid ${RULE}`, flexShrink: 0 }}>
          <span style={{ color: T.mute, fontSize: 12, fontWeight: W.body }}>
            Relatório de vistoria
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 8 : 4 }}>
            {report?.excel_url ? (
              <a
                href={report.excel_url}
                target="_blank"
                rel="noreferrer"
                aria-label="Baixar planilha"
                title="Baixar planilha"
                style={isDesktop ? undefined : { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: R.control, background: T.chip, color: T.accent }}
              >
                {isDesktop ? (
                  <Button variant="secondary" style={{ fontSize: 12, padding: '7px 13px' }}>
                    <Download size={13} /> Baixar planilha
                  </Button>
                ) : (
                  <Download size={18} />
                )}
              </a>
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
    </div>
  );
}
