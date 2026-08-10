'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Button, Spinner } from '@/app/components/ui';
import { useInspection, useGenerateExcel } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { MAINTENANCE_TYPES, CATEGORIES, PRIORITIES, RECORD_STATUS, labelOf } from '@/app/lib/maintenanceOptions';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

const S = {
  th: { textAlign: 'left', padding: '10px 12px', color: T.mute, fontSize: 11, fontWeight: W.body, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', color: T.text, fontSize: 12, borderTop: `1px solid ${T.line}`, verticalAlign: 'top' },
};

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/**
 * Prévia de uma vistoria: cabeçalho, ações e a tabela com as mesmas
 * colunas da aba "Ocorrências" da planilha.
 */
export function InspectionPreview({ report }) {
  const [showDocument, setShowDocument] = useState(false);
  const generateExcel = useGenerateExcel();
  const { show: toast } = useToastStore();

  const entries = sortFloorsDesc(
    (report?.floor_form_entries ?? []).map((e) => ({ ...e, label: e.floor?.label ?? '' }))
  );
  const rows = entries.flatMap((entry) =>
    (entry.maintenance_records ?? []).map((record) => ({ floor: entry.floor?.label, ...record }))
  );

  async function handleGenerate() {
    try {
      const { excel_url } = await generateExcel.mutateAsync(report.id);
      toast('Planilha gerada!', 'success');
      if (excel_url) window.open(excel_url, '_blank', 'noreferrer');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao gerar planilha', 'error');
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: T.text, fontWeight: W.title, fontSize: 14 }}>{report.building?.name}</p>
          <p style={{ color: T.mute, fontSize: 12 }}>
            Vistoria feita por {report.inspector?.name ?? 'Usuário removido'} · {entries.length} andar{entries.length !== 1 ? 'es' : ''} · {rows.length} ocorrência{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {report.excel_url ? (
            <a href={report.excel_url} target="_blank" rel="noreferrer">
              <Button variant="secondary" style={{ fontSize: 12, padding: '8px 14px' }}>
                <Download size={13} /> Baixar planilha
              </Button>
            </a>
          ) : (
            <Button onClick={handleGenerate} loading={generateExcel.isPending} style={{ fontSize: 12, padding: '8px 14px' }}>
              <FileSpreadsheet size={13} /> Gerar planilha
            </Button>
          )}
          <Button variant="secondary" style={{ fontSize: 12, padding: '8px 14px' }}
            onClick={() => setShowDocument(true)}>
            <FileText size={13} /> Relatório completo
          </Button>
        </div>
      </div>

      <div>
        <p style={{ color: T.text, fontSize: 14, fontWeight: W.title, marginBottom: 10 }}>
          Prévia da planilha
        </p>

        {rows.length === 0 ? (
          <p style={{ color: T.mute, fontSize: 13, padding: '16px 0' }}>
            Nenhuma ocorrência relatada nesta vistoria.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', background: T.chip, borderRadius: R.control }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Andar', 'Tipo de manutenção', 'Categoria', 'Prioridade', 'Descrição', 'Responsável', 'Status'].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{row.floor}</td>
                    <td style={S.td}>{labelOf(MAINTENANCE_TYPES, row.maintenance_type)}</td>
                    <td style={S.td}>{labelOf(CATEGORIES, row.category)}</td>
                    <td style={S.td}>
                      <Badge variant={PRIORITY_VARIANT[row.priority] ?? 'default'}>{labelOf(PRIORITIES, row.priority)}</Badge>
                    </td>
                    <td style={{ ...S.td, minWidth: 220 }}>{row.description}</td>
                    <td style={S.td}>{row.responsible}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{labelOf(RECORD_STATUS, row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReportDocumentModal
        open={showDocument}
        onClose={() => setShowDocument(false)}
        reportId={report.id}
      />
    </>
  );
}

/** Casca de modal para abrir a prévia a partir de uma linha de histórico. */
export function InspectionPreviewModal({ open, onClose, reportId }) {
  const { data: report, isLoading } = useInspection(open ? reportId : null);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div className="anim-scale-in" style={{ position: 'relative', background: T.card, borderRadius: R.card, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <h2 style={{ color: T.text, fontWeight: W.title, fontSize: 16 }}>Prévia da vistoria</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
          {report && <InspectionPreview report={report} />}
        </div>
      </div>
    </div>
  );
}
