'use client';
import { useState } from 'react';
import { Badge, Skeleton } from '@/app/components/ui';
import { OcorrenciaModal, shortDay } from '@/app/components/OcorrenciaModal';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import { CELL_PAD_Y, placeholderCellHeight } from '@/app/lib/pagination';
import {
  MAINTENANCE_TYPES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { T, W } from '@/app/lib/theme';

// No histórico (painel), as linhas usam CELL_PAD_Y (7px) para caber no cartão.
// Nas demais tabelas (como Finalizados), o recuo é maior para não ficarem compactas.
const PAD_Y_AMPLO = 13;

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
export function OcorrenciasTable({ buildingId, group = 'TODOS', columns = 'HISTORICO', empty, filters, pageSize, padX = 22 }) {
  const { rows, isLoading: loading, ...pager } = useBuildingOccurrences(buildingId, group, filters, pageSize);
  // A lista da página que está saindo não fica na tela esperando a próxima: até
  // a resposta chegar, o que se vê é esqueleto (ver `usePagedList`).
  const shown = pager.isPaging ? [] : rows;
  const [picked, setPicked] = useState(null);

  const cols = COLUMN_SETS[columns];

  // Lista vazia por filtro e prédio sem ocorrência nenhuma são coisas
  // diferentes: a primeira tem conserto — mexer no filtro —, e dizer "nenhuma
  // ocorrência ainda" mandaria a pessoa procurar o problema no lugar errado.
  const filtrando = Object.values(filters ?? {}).some((v) => v !== '' && v !== undefined && v !== null);

  const emptyMessage = !buildingId
    ? 'As ocorrências são de um prédio — esta conta não está vinculada a nenhum'
    : filtrando
      ? 'Nenhuma ocorrência com esses filtros'
      : empty ?? 'Nenhuma ocorrência neste prédio ainda';

  const isHistorico = columns === 'HISTORICO';
  const padY = isHistorico ? CELL_PAD_Y : PAD_Y_AMPLO;
  const rowHeight = isHistorico ? 42 : undefined;
  const cell = {
    padding: `${padY}px ${padX}px`,
    fontSize: 14,
    whiteSpace: 'nowrap',
    height: rowHeight,
    boxSizing: 'border-box',
  };
  const placeholderCell = {
    ...cell,
    height: isHistorico ? 42 : placeholderCellHeight({ content: 20, padY }),
  };

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {cols.map((c) => (
              <th key={c.label} style={{ textAlign: 'left', padding: `${isHistorico ? 10 : 12}px ${padX}px`, color: T.mute, fontSize: 12, fontWeight: W.body }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* `key` na página: as linhas entram de novo a cada seta — sem isso o
            texto troca no lugar e nada diz que a página andou. */}
        <tbody key={pager.page}>
          {pager.placeholders.map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}`, height: rowHeight }}>
              {cols.map((c) => (
                <td key={c.label} style={placeholderCell}>
                  <Skeleton style={{ height: 14 }} />
                </td>
              ))}
            </tr>
          ))}

          {shown.map((o, idx) => (
            <tr
              key={o.id}
              onClick={() => setPicked(o)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer', height: rowHeight }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {cols.map((c) => (
                <td key={c.label} style={{ ...cell, color: c.muted ? T.mute : T.text }}>
                  {c.render(o)}
                </td>
              ))}
            </tr>
          ))}

          {!loading && !pager.isPaging && rows.length === 0 && (
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
        count={shown.length}
        pageSize={pager.pageSize}
        onPrev={pager.prev}
        onNext={pager.next}
        isFetching={pager.isFetching}
        style={{ padding: `12px ${padX}px`, borderTop: `1px solid ${T.line}` }}
      />

      <OcorrenciaModal open={!!picked} occurrence={picked} onClose={() => setPicked(null)} />
    </>
  );
}
