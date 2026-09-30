'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download } from 'lucide-react';
import { ResponsavelShell } from '@/app/components/ResponsavelShell';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { HistoricoSwitcher, useHistoricoView } from '@/app/components/HistoricoSwitcher';
import { AmpliarHistorico } from '@/app/components/HistoricoExpandido';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { Paginator } from '@/app/components/Paginator';
import { ChipSelect } from '@/app/components/ChipSelect';
import { Badge, Skeleton } from '@/app/components/ui';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { useBuildingHistory } from '@/app/hooks/useApi';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { parseReportDate } from '@/app/lib/date';
import { CELL_PAD_Y } from '@/app/lib/pagination';
import { T, R, W } from '@/app/lib/theme';

const PLACEHOLDER_CELL = { padding: `${CELL_PAD_Y}px 22px`, height: 42, boxSizing: 'border-box' };
const CELULA = { padding: `${CELL_PAD_Y}px 22px`, height: 42, boxSizing: 'border-box', whiteSpace: 'nowrap' };

const STATUS_LABEL = { IN_PROGRESS: 'Em andamento', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { IN_PROGRESS: 'accent', COMPLETED: 'success' };

const ehResponsavel = (b) => b.role === 'RESPONSAVEL';

/**
 * A tabela de vistorias do prédio — a mesma do painel do moderador (ver
 * `moderador/page.js`): inspetor, estado, dia e planilha, e a linha abre o
 * relatório completo do dia.
 */
function TabelaDeVistorias({ buildingId, onAbrir }) {
  const { download, pendingId } = useExcelDownload();
  const vistorias = useBuildingHistory(buildingId);
  const rows = vistorias.isPaging ? [] : vistorias.rows;

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {['Inspetor', 'Status', 'Dia', 'Planilha'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 12, fontWeight: W.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody key={vistorias.page}>
          {vistorias.placeholders.map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}`, height: 42 }}>
              {[1, 2, 3, 4].map((j) => (
                <td key={j} style={PLACEHOLDER_CELL}><Skeleton style={{ height: 14 }} /></td>
              ))}
            </tr>
          ))}

          {rows.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => onAbrir(r.id)}
              className={`linha-clicavel anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer', height: 42 }}
            >
              <td style={{ ...CELULA, color: T.text, fontSize: 14 }}>{r.inspector?.name ?? '—'}</td>
              <td style={CELULA}><Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
              <td style={{ ...CELULA, color: T.mute, fontSize: 14 }}>
                {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
              </td>
              <td style={CELULA}>
                {r.has_excel ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); download(r.id); }}
                    disabled={pendingId === r.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.accentInk, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Download size={13} /> Baixar
                  </button>
                ) : (
                  <span style={{ color: T.mute, fontSize: 14 }}>—</span>
                )}
              </td>
            </tr>
          ))}

          {!vistorias.isLoading && !vistorias.isPaging && rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '40px 22px', textAlign: 'center', color: T.mute, fontSize: 14 }}>
                Nenhuma vistoria neste prédio ainda
              </td>
            </tr>
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
        style={{ borderTop: `1px solid ${T.line}`, padding: '12px 22px' }}
      />
    </>
  );
}

/**
 * O histórico do prédio, na mesma leitura que o moderador tem: as vistorias e as
 * ocorrências, alternadas pelo mesmo seletor, com o mesmo "ampliar".
 *
 * Aba própria, separada de "Minha atividade", porque responde a outra pergunta:
 * não é o que ele fez, é o que o prédio viveu — e é aqui que ele confere a
 * vistoria que abriu o chamado que está com ele.
 *
 * Só os prédios em que a pessoa é responsável entram na troca. Quem também
 * vistoria outro prédio tem o histórico dele na área do inspetor.
 */
export default function HistoricoDoPredioPage() {
  const { buildings, buildingId, setActive, isLoading } = useActiveBuilding({ filter: ehResponsavel });
  const historico = useHistoricoView();
  const [reportId, setReportId] = useState(null);
  const predio = buildings.find((b) => b.building_id === buildingId);

  return (
    <ResponsavelShell
      title="Histórico do prédio"
      subtitle={predio?.name ?? 'As vistorias e as ocorrências do prédio'}
      actions={
        buildings.length > 1 && (
          <ChipSelect
            label="Prédio"
            options={buildings.map((b) => ({ value: b.building_id, label: b.name }))}
            value={buildingId ?? ''}
            onChange={setActive}
            ativo={false}
          />
        )
      }
    >
      <div style={{ flex: 1, minHeight: 0, padding: '2px 32px 32px', display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <Skeleton style={{ flex: 1, borderRadius: R.card }} />
        ) : !buildingId ? (
          <div style={{ background: T.card, borderRadius: R.card, padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ color: T.text, fontWeight: W.title }}>Nenhum prédio</p>
            <p style={{ color: T.mute, fontSize: 14, marginTop: 6 }}>Você não é responsável em nenhum prédio agora.</p>
          </div>
        ) : (
          <div
            className="anim-fade-up"
            style={{ flex: 1, minHeight: 0, background: T.card, borderRadius: R.card, boxShadow: T.cardRing, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
              <HistoricoSwitcher
                view={historico.view}
                onSelect={historico.select}
                title={historico.title}
                action={<AmpliarHistorico view={historico.view} onSelectView={historico.select} buildingId={buildingId} />}
                subtitle={
                  historico.isVistorias
                    ? 'Clique numa linha para abrir o relatório completo do dia'
                    : 'O que as vistorias encontraram, da mais recente para a mais antiga'
                }
              />
            </div>

            <div
              key={`${historico.view}-${buildingId}`}
              className="anim-fade-up"
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              {historico.isVistorias
                ? <TabelaDeVistorias buildingId={buildingId} onAbrir={setReportId} />
                : <OcorrenciasTable buildingId={buildingId} />}
            </div>
          </div>
        )}
      </div>

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />
    </ResponsavelShell>
  );
}
