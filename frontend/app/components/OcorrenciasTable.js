'use client';
import { useState } from 'react';
import { Badge, Skeleton } from '@/app/components/ui';
import { OcorrenciaModal, shortDay } from '@/app/components/OcorrenciaModal';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { T, W } from '@/app/lib/theme';

const CELL = { padding: '11px 22px', fontSize: 14 };

/**
 * As colunas de cada leitura.
 *
 * A tabela é a mesma — muda o que se quer bater o olho e ver. No histórico é
 * "onde está isso"; nos chamados fechados o estado é o mesmo em todas as linhas
 * e não diz nada, então o lugar dele fica com quem atendeu, quanto custou e
 * quando fechou.
 */
const COLUMN_SETS = {
  HISTORICO: [
    { label: 'Andar', render: (o) => o.floor?.label ?? '—' },
    { label: 'Tipo', render: (o) => labelOf(MAINTENANCE_TYPES, o.maintenance_type) },
    {
      label: 'Status',
      render: (o) => (
        <Badge variant={RECORD_STATUS_VARIANT[o.status] ?? 'default'}>
          {OCCURRENCE_STATUS_LABEL[o.status] ?? o.status}
        </Badge>
      ),
    },
    { label: 'Dia', render: (o) => shortDay(o.report?.date), muted: true },
  ],
  CONCLUIDOS: [
    { label: 'Andar', render: (o) => o.floor?.label ?? '—' },
    { label: 'Tipo', render: (o) => labelOf(MAINTENANCE_TYPES, o.maintenance_type) },
    { label: 'Responsável', render: (o) => o.responsible ?? 'Sem responsável', muted: true },
    { label: 'Gasto', render: (o) => formatCost(o.maintenance_cost), muted: true },
    { label: 'Fechado em', render: (o) => shortDay(o.closed_at), muted: true },
  ],
};

/**
 * As ocorrências em tabela, e a caixa que abre ao clicar numa linha.
 *
 * A forma é a das outras listas do produto — a de usuários do admin, a de
 * relatórios do painel: as poucas colunas que deixam achar a linha, e o resto
 * numa caixa que abre. Nada de descrição aqui: um parágrafo por linha faz a
 * lista deixar de ser lista.
 */
export function OcorrenciasTable({ buildingId, group = 'TODOS', columns = 'HISTORICO', empty }) {
  const { rows, isLoading: loading, ...pager } = useBuildingOccurrences(buildingId, group);
  const [picked, setPicked] = useState(null);

  const cols = COLUMN_SETS[columns];

  const emptyMessage = buildingId
    ? empty ?? 'Nenhuma ocorrência neste prédio ainda'
    : 'As ocorrências são de um prédio — esta conta não está vinculada a nenhum';

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {cols.map((c) => (
              <th key={c.label} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 12, fontWeight: W.body }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* `key` na página: as linhas entram de novo a cada seta — sem isso o
            texto troca no lugar e nada diz que a página andou. */}
        <tbody key={pager.page}>
          {loading && [1, 2, 3].map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
              {cols.map((c) => (
                <td key={c.label} style={{ padding: '10px 22px' }}><Skeleton style={{ height: 14 }} /></td>
              ))}
            </tr>
          ))}

          {rows.map((o, idx) => (
            <tr
              key={o.id}
              onClick={() => setPicked(o)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {cols.map((c) => (
                <td key={c.label} style={{ ...CELL, color: c.muted ? T.mute : T.text }}>
                  {c.render(o)}
                </td>
              ))}
            </tr>
          ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} style={{ padding: '40px 22px', textAlign: 'center', color: T.mute, fontSize: 14 }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Paginator
        page={pager.page}
        pages={pager.pages}
        total={pager.total}
        count={rows.length}
        pageSize={pager.pageSize}
        onPrev={pager.prev}
        onNext={pager.next}
        isFetching={pager.isFetching}
        style={{ borderTop: `1px solid ${T.line}`, padding: '12px 22px' }}
      />

      <OcorrenciaModal open={!!picked} occurrence={picked} onClose={() => setPicked(null)} />
    </>
  );
}
