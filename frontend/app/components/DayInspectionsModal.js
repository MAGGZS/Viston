'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X } from 'lucide-react';
import { Spinner } from '@/app/components/ui';
import { InspectionPreview } from '@/app/components/InspectionPreview';
import { useInspection } from '@/app/hooks/useApi';
import { T, R, W } from '@/app/lib/theme';

/**
 * Detalhes de um dia do calendário: quem vistoriou, prévia da planilha,
 * download e link do relatório completo.
 */
export function DayInspectionsModal({ open, onClose, day, info }) {
  const reports = info?.reports ?? [];

  // A seleção é derivada, não sincronizada por efeito: quando o dia muda, o id
  // escolhido deixa de existir na lista e a prévia volta sozinha para o primeiro
  // relatório — sem render em cascata.
  const [pickedId, setPickedId] = useState(null);
  const selectedId = reports.some((r) => r.id === pickedId) ? pickedId : reports[0]?.id ?? null;

  const { data: report, isLoading } = useInspection(open ? selectedId : null);

  if (!open) return null;

  const dayLabel = day ? format(new Date(`${day}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />

      <div className="anim-scale-in" style={{ position: 'relative', background: T.card, borderRadius: R.card, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <div>
            <h2 style={{ color: T.text, fontWeight: W.title, fontSize: 16, textTransform: 'capitalize' }}>{dayLabel}</h2>
            <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
              {reports.length} vistoria{reports.length !== 1 ? 's' : ''} neste dia
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4 }}>
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
                  <button key={r.id} onClick={() => setPickedId(r.id)}
                    style={{ padding: '8px 14px', borderRadius: R.pill, cursor: 'pointer', fontSize: 12, fontWeight: W.strong, border: 'none', background: active ? T.accent : T.chip, color: active ? T.onAccent : T.text }}>
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
