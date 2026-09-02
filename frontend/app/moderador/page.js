'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Inbox, Send, Loader, CheckCheck } from 'lucide-react';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';
import { OcorrenciasPorStatus } from '@/app/components/OcorrenciasPorStatus';
import { OcorrenciasPorCategoria } from '@/app/components/OcorrenciasPorCategoria';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { Badge, Skeleton, StatCard } from '@/app/components/ui';
import { HistoricoSwitcher, useHistoricoView } from '@/app/components/HistoricoSwitcher';
import { AmpliarHistorico } from '@/app/components/HistoricoExpandido';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingHistory, useTicketStats } from '@/app/hooks/useApi';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { parseReportDate } from '@/app/lib/date';
import { placeholderCellHeight } from '@/app/lib/pagination';
import { T, R, W } from '@/app/lib/theme';

// A célula de espera tem a altura da de verdade — o `Badge` da coluna de status
// entre os 11px de recuo —, para o cartão não encolher a cada seta.
const PLACEHOLDER_CELL = { padding: '11px 22px', height: placeholderCellHeight({ padY: 11 }) };

const STATUS_LABEL = { IN_PROGRESS: 'Em andamento', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { IN_PROGRESS: 'accent', COMPLETED: 'success' };

/**
 * A altura de cada cartão da fileira do meio — uma por cartão, e é o ponto.
 *
 * Escritas, e não herdadas: com `alignItems: 'stretch'`, o mais alto dos dois
 * mandaria no outro, e a pizza passaria a crescer porque chegou mais uma
 * vistoria ao histórico — coisas que não têm nada a ver uma com a outra. Cada
 * um se mede pelo que carrega, e mudar um não mexe no outro.
 *
 * A pizza cabe em 534 com a rosca de 220, e 540 é o teto redondo disso. O
 * histórico sai da conta das dez linhas: cabeçalho 134 + topo da tabela 39 +
 * 10 linhas de 50 + rodapé 59. Os dois números são diferentes porque o que
 * cada cartão tem para mostrar é diferente.
 */
const ALTURA_PIZZA = 540;
const ALTURA_HISTORICO = 732;

/**
 * Quantas vistorias e ocorrências o cartão mostra antes das setas.
 *
 * Dez, acima das oito de `HISTORY_PAGE_SIZE`. O padrão é o teto de um cartão
 * que cresce com o conteúdo e divide a fileira com outro; este tem altura
 * própria, então quem manda no número é quanto se quer ler antes de mudar de
 * página. Vale para as duas visões — vistorias e ocorrências —, que dividem o
 * mesmo cartão e não podiam trocar de tamanho ao alternar.
 */
const LINHAS_DO_HISTORICO = 10;

/**
 * O painel do moderador.
 *
 * É onde ele cai ao entrar, antes das telas de chamado: quantos chamados estão
 * em cada ponto do caminho, onde eles estão parados, o histórico de relatórios
 * do prédio — o mesmo do inspetor e do visualizador — e de que tipo de trabalho
 * o prédio é feito.
 *
 * A tela desce em graus de detalhe. Os contadores do topo são o número que se
 * bate o olho e vai embora. A pizza abre esse número: mostra de que o "em
 * andamento" é feito, e é o único lugar da tela onde a decisão parada com o
 * moderador — o chamado que o responsável já deu por terminado — aparece
 * separada. As barras de categoria embaixo trocam a pergunta: não é mais onde o
 * trabalho está, é de que ele é.
 *
 * Os dois gráficos têm período próprio, e não um só compartilhado: quem compara
 * o mês corrente com o ano inteiro precisa dos dois recortes na tela ao mesmo
 * tempo.
 */
export default function ModeradorPage() {
  const { download, pendingId } = useExcelDownload();
  const { building, isLoading: buildingLoading } = useModeratorBuilding();
  const buildingId = building?.building_id;

  // Os dois históricos dividem o mesmo cartão, como no histórico do inspetor. A
  // visão mora aqui para o modal de relatório não levá-la junto ao fechar.
  const historico = useHistoricoView();

  const [reportId, setReportId] = useState(null);

  const { data: stats, isLoading: statsLoading } = useTicketStats(buildingId);
  // Dez por página, o que cabe na altura do cartão: quem anda pelo resto é o
  // rodapé de setas.
  const vistorias = useBuildingHistory(buildingId, {}, { pageSize: LINHAS_DO_HISTORICO });
  // Enquanto a próxima página não chega, a que está saindo deixa a tela: o que
  // se vê é esqueleto, e não uma lista velha passando por nova (ver
  // `usePagedList`).
  const rows = vistorias.isPaging ? [] : vistorias.rows;
  const histLoading = vistorias.isLoading;


  /**
   * O histórico de vistorias: a tabela de relatórios do prédio, como sempre
   * foi. Sai do meio do cartão para uma constante porque agora divide o
   * lugar com a lista de ocorrências, e as duas alternam por uma linha só.
   */
  const relatoriosPanel = (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {['Inspetor', 'Status', 'Dia', 'Planilha'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 12, fontWeight: W.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        {/* `key` na página: as linhas entram de novo a cada seta. */}
        <tbody key={vistorias.page}>
          {vistorias.placeholders.map((i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
              {[1, 2, 3, 4].map((j) => (
                <td key={j} style={PLACEHOLDER_CELL}><Skeleton style={{ height: 14 }} /></td>
              ))}
            </tr>
          ))}

          {rows.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => setReportId(r.id)}
              className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
              style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={{ padding: '11px 22px', color: T.text, fontSize: 14 }}>{r.inspector?.name ?? '—'}</td>
              <td style={{ padding: '11px 22px' }}>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
              {/* Só o dia: a planilha e o relatório passaram a ser do dia */}
              <td style={{ padding: '11px 22px', color: T.mute, fontSize: 14 }}>
                {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
              </td>
              <td style={{ padding: '11px 22px' }}>
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

          {!histLoading && !vistorias.isPaging && rows.length === 0 && (
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

  return (
    <ModeradorShell
      building={building}
      isLoading={buildingLoading}
      title="Painel"
      subtitle={building?.name}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Onde estão os chamados, na ordem do caminho que eles fazem.
            "Encaminhados" é contador próprio, e não parte de "em andamento":
            ninguém aceitou esses ainda, e somá-los ao que está sendo feito
            esconderia a fila que o moderador tem de cobrar. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard className="anim-fade-up anim-d1" icon={Inbox} label="Em aberto" value={stats?.abertos} loading={statsLoading} />
          <StatCard className="anim-fade-up anim-d2" icon={Send} label="Encaminhados" value={stats?.encaminhados} loading={statsLoading} />
          <StatCard className="anim-fade-up anim-d3" icon={Loader} label="Em andamento" value={stats?.em_andamento} loading={statsLoading} />
          <StatCard className="anim-fade-up anim-d4" icon={CheckCheck} label="Concluídos" value={stats?.concluidos} loading={statsLoading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, alignItems: 'start' }}>
          {/* Onde estão as ocorrências do período, em pizza.

              Tomou o lugar do calendário de atividade. Os dois cabiam aqui, mas
              não respondiam à mesma pessoa: o calendário diz em que dias se
              vistoriou, que é a pergunta de quem monta escala, e esta é a mesa
              de quem despacha chamado. O calendário continua onde ele responde
              alguma coisa — a tela inicial, o histórico e o painel do gestor. */}
          <OcorrenciasPorStatus
            buildingId={buildingId}
            className="anim-fade-up anim-d5"
            style={{ height: ALTURA_PIZZA }}
          />

          {/* Histórico — a mesma leitura das outras telas, e as mesmas duas
              visões: vistorias e ocorrências, alternadas pelos botões. */}
          <div
            className="anim-fade-up anim-d6"
            style={{
              background: T.card, borderRadius: R.card, overflow: 'hidden',
              height: ALTURA_HISTORICO, display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
              <HistoricoSwitcher
                view={historico.view}
                onSelect={historico.select}
                title={historico.title}
                action={
                  <AmpliarHistorico
                    view={historico.view}
                    onSelectView={historico.select}
                    buildingId={buildingId}
                  />
                }
                subtitle={
                  historico.isVistorias
                    ? 'Clique numa linha para abrir o relatório completo do dia'
                    : 'O que as vistorias encontraram, da mais recente para a mais antiga'
                }
              />
            </div>

            {/* `key` na visão: só o conteúdo do cartão troca — os contadores e
                a pizza ao lado ficam onde estão.

                `overflowY: auto` é válvula, e não como se anda pela lista: com
                seis linhas nada rola aqui, e quem passa de página é o rodapé de
                setas. Ele existe para a visão que sair um ou dois pixels mais
                alta ficar alcançável em vez de aparada. */}
            <div
              key={historico.view}
              className="anim-fade-up"
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                // A tabela em cima e o rodapé de setas embaixo, com a folga da
                // altura entre os dois. Sem isto, uma página com menos linhas
                // que o normal — a última — traria o rodapé para o meio do
                // cartão, e o pé dele ficaria vazio.
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}
            >
              {historico.isVistorias
                ? relatoriosPanel
                : <OcorrenciasTable buildingId={buildingId} pageSize={LINHAS_DO_HISTORICO} />}
            </div>
          </div>
        </div>

        {/* Largo e embaixo: são cinco barras a comparar entre si, e comparação
            de comprimento quer a linha inteira. Ao lado dos outros dois ele
            teria um terço da tela e as barras curtas ficariam todas iguais. */}
        <OcorrenciasPorCategoria buildingId={buildingId} className="anim-fade-up anim-d6" />
      </div>

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />
    </ModeradorShell>
  );
}
