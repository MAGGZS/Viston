'use client';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X } from 'lucide-react';
import { Spinner } from '@/app/components/ui';
import { InspectionPreview } from '@/app/components/InspectionPreview';
import { useInspection } from '@/app/hooks/useApi';

/**
 * Detalhes de um dia do calendário: quem vistoriou, prévia da planilha,
 * download e link do relatório completo.
 */
export function DayInspectionsModal({ open, onClose, day, info }) {
  const reports = info?.reports ?? [];
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (open) setSelectedId(reports[0]?.id ?? null);
  }, [open, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: report, isLoading } = useInspection(open ? selectedId : null);

  if (!open) return null;

  const dayLabel = day ? format(new Date(`${day}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

      <div className="anim-scale-in" style={{ position: 'relative', background: 'rgba(10,10,20,0.94)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h2 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 16, textTransform: 'capitalize' }}>{dayLabel}</h2>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>
              {reports.length} vistoria{reports.length !== 1 ? 's' : ''} neste dia
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Vistorias do dia */}
          {reports.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {reports.map((r) => {
                const active = r.id === selectedId;
                return (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    style={{ padding: '8px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: `1px solid ${active ? '#F5C518' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(245,197,24,0.1)' : 'rgba(255,255,255,0.04)', color: active ? '#F5C518' : 'rgba(255,255,255,0.6)' }}>
                    {r.inspector} · {format(new Date(r.finished_at), 'HH:mm')}
                  </button>
                );
              })}
            </div>
          )}

          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
          {report && <InspectionPreview report={report} />}
        </div>
      </div>
    </div>
  );
}
