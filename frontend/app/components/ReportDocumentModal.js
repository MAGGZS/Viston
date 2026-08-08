'use client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { Button, Spinner } from '@/app/components/ui';
import { useInspection, useGenerateExcel } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { parseReportDate } from '@/app/lib/date';
import { MAINTENANCE_TYPES, CATEGORIES, PRIORITIES, RECORD_STATUS, labelOf } from '@/app/lib/maintenanceOptions';
import { useToastStore } from '@/app/store/toast';

// Folha escura: mesmo tom do app, mas com cara de documento — só tipografia e filete.
const PAPER = '#121219';
const INK = 'rgba(255,255,255,0.88)';
const INK_SOFT = 'rgba(255,255,255,0.42)';
const RULE = 'rgba(255,255,255,0.1)';

const D = {
  sheet: { background: PAPER, padding: '48px 56px 56px', color: INK, fontSize: 14, lineHeight: 1.65 },
  eyebrow: { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: INK_SOFT, fontWeight: 600 },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 6, color: INK },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 32px', marginTop: 24 },
  metaLabel: { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_SOFT, fontWeight: 600 },
  metaValue: { fontSize: 14, color: INK, marginTop: 2 },
  rule: { border: 'none', borderTop: `1px solid ${RULE}`, margin: '28px 0 0' },
  floorTitle: { fontSize: 17, fontWeight: 700, color: INK },
  th: { textAlign: 'left', padding: '8px 12px 8px 0', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_SOFT, fontWeight: 600, borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px 10px 0', fontSize: 13, color: INK, borderBottom: `1px solid ${RULE}`, verticalAlign: 'top' },
  empty: { fontSize: 13, color: INK_SOFT, fontStyle: 'italic', marginTop: 8 },
};

const FLOOR_STATUS_LABEL = { OK: 'OK', ATENCAO: 'Atenção', PROBLEMA: 'Problema' };
const FLOOR_STATUS_COLOR = { OK: '#4ade80', ATENCAO: '#fbbf24', PROBLEMA: '#f87171' };
const PRIORITY_COLOR = { ALTA: '#f87171', MEDIA: '#fbbf24', BAIXA: INK_SOFT };

/** Relatório completo da vistoria, em folha de documento dentro de um modal. */
export function ReportDocumentModal({ open, onClose, reportId }) {
  const { data: report, isLoading } = useInspection(open ? reportId : null);
  const generateExcel = useGenerateExcel();
  const { show: toast } = useToastStore();

  if (!open) return null;

  const entries = sortFloorsDesc(
    (report?.floor_form_entries ?? []).map((e) => ({ ...e, label: e.floor?.label ?? '' }))
  );
  const totalRecords = entries.reduce((sum, e) => sum + (e.maintenance_records?.length ?? 0), 0);

  async function handleGenerate() {
    try {
      const { excel_url } = await generateExcel.mutateAsync(reportId);
      toast('Planilha gerada!', 'success');
      if (excel_url) window.open(excel_url, '_blank', 'noreferrer');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao gerar planilha', 'error');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

      <div className="anim-scale-in" style={{ position: 'relative', width: '100%', maxWidth: 1000, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        {/* Barra de ações — fora da folha, para o documento ficar limpo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'rgba(8,8,14,0.96)', borderBottom: `1px solid ${RULE}` }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            Relatório de vistoria
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {report?.excel_url ? (
              <a href={report.excel_url} target="_blank" rel="noreferrer">
                <Button variant="secondary" style={{ fontSize: 12, padding: '7px 13px' }}>
                  <Download size={13} /> Baixar planilha
                </Button>
              </a>
            ) : report ? (
              <Button onClick={handleGenerate} loading={generateExcel.isPending} style={{ fontSize: 12, padding: '7px 13px' }}>
                <FileSpreadsheet size={13} /> Gerar planilha
              </Button>
            ) : null}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Folha */}
        <div style={{ overflowY: 'auto', background: PAPER }}>
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner /></div>
          )}

          {report && (
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
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FLOOR_STATUS_COLOR[entry.status_geral] ?? INK_SOFT }}>
                        {FLOOR_STATUS_LABEL[entry.status_geral] ?? entry.status_geral}
                      </span>
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
          )}
        </div>
      </div>
    </div>
  );
}
