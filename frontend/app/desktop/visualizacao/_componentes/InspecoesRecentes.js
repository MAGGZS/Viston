'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Eye } from 'lucide-react';
import { Badge, Skeleton } from '@/app/components/ui';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingHistory } from '@/app/hooks/useApi';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { parseReportDate } from '@/app/lib/date';
import { CELL_PAD_Y, placeholderCellHeight } from '@/app/lib/pagination';
import { T, R, W } from '@/app/lib/theme';

// A célula de espera tem a altura da de verdade — o `Badge` da coluna de status
// entre os recuos da `.cell-y`, gêmea de `CELL_PAD_Y` (ver
// app/lib/pagination.js) —, para o cartão não encolher a cada seta.
const PLACEHOLDER_CELL_H = placeholderCellHeight({ padY: CELL_PAD_Y });

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success', COMPLETED: 'success' };

/**
 * As vistorias enviadas no prédio, com a planilha e a prévia de cada uma.
 *
 * Veio da tela antiga do visualizador sem mudar de comportamento: é por aqui
 * que o supervisor confere o que a ronda encontrou, e a planilha é o que ele
 * repassa adiante.
 */
export function InspecoesRecentes({ buildingId }) {
  const { download, pendingId } = useExcelDownload();
  const [previewId, setPreviewId] = useState(null);
  const vistorias = useBuildingHistory(buildingId);
  // Enquanto a próxima página não chega, a que está saindo deixa a tela: o que
  // se vê é esqueleto, e não uma lista velha passando por nova.
  const rows = vistorias.isPaging ? [] : vistorias.rows;

  return (
    <section
      aria-labelledby="inspecoes-recentes"
      style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, overflow: 'hidden' }}
    >
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
        <h2 id="inspecoes-recentes" style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>Inspeções recentes</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            {['Inspetor', 'Status', 'Dia', 'Excel'].map((h) => (
              <th key={h} scope="col" className="text-left px-6 py-3 text-mute text-xs font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        {/* `key` na página: as linhas entram de novo a cada seta. */}
        <tbody key={vistorias.page}>
          {vistorias.placeholders.map((i) => (
            <tr key={i} className="border-b border-line">
              {[1, 2, 3, 4].map((j) => (
                <td key={j} className="px-6 cell-y" style={{ height: PLACEHOLDER_CELL_H }}>
                  <Skeleton className="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
          {rows.map((r, idx) => (
            <tr key={r.id} className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} border-b border-line hover:bg-chip transition-colors`}>
              <td className="px-6 cell-y text-ink text-sm">{r.inspector?.name ?? '—'}</td>
              <td className="px-6 cell-y">
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
              <td className="px-6 cell-y text-mute text-sm">
                {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
              </td>
              <td className="px-6 cell-y">
                <div className="flex items-center gap-4">
                  {r.has_excel ? (
                    <button type="button" onClick={() => download(r.id)} disabled={pendingId === r.id}
                      className="flex items-center gap-1 text-accent-ink text-sm hover:underline disabled:opacity-50">
                      <Download size={13} aria-hidden="true" /> Baixar
                    </button>
                  ) : <span className="text-mute text-sm">—</span>}
                  <button type="button" onClick={() => setPreviewId(r.id)}
                    className="flex items-center gap-1 text-mute text-sm hover:text-ink transition-all duration-150 active:scale-95">
                    <Eye size={13} aria-hidden="true" /> Prévia
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!vistorias.isLoading && !vistorias.isPaging && rows.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-10 text-center text-mute text-sm">Nenhuma inspeção encontrada</td></tr>
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

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />
    </section>
  );
}
