'use client';
import { useId } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X } from 'lucide-react';
import { Dialog, Spinner } from '@/app/components/ui';
import { InspectionPreview } from '@/app/components/InspectionPreview';
import { useDayReport } from '@/app/hooks/useApi';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import { T, R, W } from '@/app/lib/theme';

/**
 * Detalhes de um dia do calendário: quem vistoriou, prévia da planilha,
 * download e link do relatório completo.
 *
 * Uma prévia só para o dia inteiro, e não uma por vistoria. Antes o dia com
 * três vistorias virava três abas com a hora de cada envio; agora a hora sumiu
 * junto com as abas — o documento é do dia, e os três nomes aparecem nele.
 */
export function DayInspectionsModal({ open, onClose, day, info }) {
  const { mounted, closing } = useExitTransition(open);
  const titleId = useId();
  // O dia e os relatórios ficam congelados na saída — a tela que abre zera o
  // estado no `onClose` e a caixa sairia vazia.
  const shownDay = useKeepWhileClosing(day, open);
  const shownInfo = useKeepWhileClosing(info, open);

  const reports = shownInfo?.reports ?? [];

  // Qualquer vistoria daquele dia serve de porta de entrada: a API resolve o
  // dia a partir dela e devolve as três juntas.
  const anchorId = reports[0]?.id ?? null;
  const { data: report, isLoading } = useDayReport(mounted ? anchorId : null);

  if (!mounted) return null;

  const dayLabel = shownDay ? format(new Date(`${shownDay}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '';

  return (
    <Dialog
      onClose={onClose}
      className={closing ? 'is-closing' : ''}
      labelledBy={titleId}
      style={{ width: 860, maxHeight: '85vh' }}
    >
      <div
        className={closing ? 'anim-scale-out' : 'anim-scale-in'}
        style={{ background: T.card, borderRadius: R.card, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px', borderBottom: `1px solid ${T.line}` }}>
          <div>
            <h2 id={titleId} style={{ color: T.text, fontWeight: W.title, fontSize: 16, textTransform: 'capitalize' }}>{dayLabel}</h2>
            <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
              {reports.length} vistoria{reports.length !== 1 ? 's' : ''} neste dia
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
          {report && <InspectionPreview report={report} reportId={anchorId} />}
        </div>
      </div>
    </Dialog>
  );
}
