'use client';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { Badge, Button, Spinner } from '@/app/components/ui';
import { useInspection, useGenerateExcel } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { MAINTENANCE_TYPES, CATEGORIES, PRIORITIES, RECORD_STATUS, labelOf } from '@/app/lib/maintenanceOptions';
import { useToastStore } from '@/app/store/toast';

const S = {
  th: { textAlign: 'left', padding: '8px 10px', color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' },
};

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/**
 * Prévia de uma vistoria: cabeçalho, ações e a tabela com as mesmas
 * colunas da aba "Ocorrências" da planilha.
 */
export function InspectionPreview({ report, onNavigate }) {
  const router = useRouter();
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
          <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 14 }}>{report.building?.name}</p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
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
            onClick={() => { onNavigate?.(); router.push(`/historico/${report.id}`); }}>
            <FileText size={13} /> Relatório completo
          </Button>
        </div>
      </div>

      <div>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Prévia da planilha
        </p>

        {rows.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '16px 0' }}>
            Nenhuma ocorrência relatada nesta vistoria.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
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
    </>
  );
}

/** Casca de modal para abrir a prévia a partir de uma linha de histórico. */
export function InspectionPreviewModal({ open, onClose, reportId }) {
  const { data: report, isLoading } = useInspection(open ? reportId : null);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

      <div className="anim-scale-in" style={{ position: 'relative', background: 'rgba(10,10,20,0.94)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 16 }}>Prévia da vistoria</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
          {report && <InspectionPreview report={report} onNavigate={onClose} />}
        </div>
      </div>
    </div>
  );
}
