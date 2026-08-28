'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Maximize2, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge, Button, Dialog, Modal, Select, Skeleton } from '@/app/components/ui';
import { HISTORICO_VIEWS, HistoricoSwitcher, OcorrenciasList } from '@/app/components/HistoricoSwitcher';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { Paginator } from '@/app/components/Paginator';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { useBuildingHistory, useBuildingResponsibles, useFloors, useInspections } from '@/app/hooks/useApi';
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue';
import { useExitTransition } from '@/app/hooks/useExitTransition';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { parseReportDate } from '@/app/lib/date';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import {
  CATEGORIES,
  MAINTENANCE_TYPES,
  PRIORITIES,
  RECORD_STATUS,
} from '@/app/lib/maintenanceOptions';
import { T, R, W } from '@/app/lib/theme';

/**
 * O histórico em tamanho de tela.
 *
 * O cartão do painel mostra oito linhas e nenhuma pergunta: ele é um resumo, e
 * é bom nisso. Só que a pergunta de quem administra prédio quase nunca é "o que
 * aconteceu por último" — é "o que o Carlos vistoriou em julho" ou "quais
 * infiltrações do 6º andar ainda estão abertas". Sem filtro, isso se responde
 * clicando página por página até achar.
 *
 * O miolo — a busca, os filtros, a lista e o rodapé — é um só, e mora em
 * `HistoricoCompleto`. O que muda é a moldura: no computador ele abre numa
 * caixa sobre o cartão; no telefone ele é uma tela, com endereço próprio e
 * botão de voltar. Caixa é interrupção, e no telefone uma lista com filtro e
 * paginação não interrompe nada — é para onde a pessoa foi, e o voltar do
 * aparelho tem de trazê-la de volta.
 *
 * Vinte linhas por página, e não oito: aqui não há calendário ao lado para
 * empurrar, e o que decide a altura é a janela.
 */
const PAGE_SIZE = 20;

/** Onde mora a tela cheia do telefone. */
export const HISTORICO_COMPLETO_HREF = '/historico/completo';

/**
 * Do que é feita a filtragem de cada visão — o vazio que "limpar" restaura.
 *
 * `q` fica de fora: a busca tem barra própria, à vista, e não entra na conta do
 * ícone de filtros nem na caixa que ele abre.
 */
const FILTROS_VAZIOS = {
  VISTORIAS: { floor_id: '', date_from: '', date_to: '' },
  OCORRENCIAS: {
    floor_id: '',
    date_from: '',
    date_to: '',
    maintenance_type: '',
    category: '',
    priority: '',
    status: '',
    responsible_id: '',
  },
};

/** Só o que foi escolhido vai na URL — campo em branco é ausência de filtro. */
function preenchidos(filtros) {
  return Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== ''));
}

/** Quantos recortes estão valendo. É o número que o ícone carrega. */
function contarAtivos(filtros) {
  return Object.values(filtros).filter((v) => v !== '').length;
}

const inputStyle = {
  background: T.chip, border: '1px solid transparent', borderRadius: R.control,
  padding: '10px 13px', color: T.text, fontSize: 14, outline: 'none', width: '100%',
  fontFamily: 'inherit',
};

/** Rótulo em cima, campo embaixo — a forma dos formulários do produto. */
function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ color: T.mute, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

/** Droplist de filtro: a primeira opção é sempre "não filtrar por isto". */
function Filtro({ label, todos, options, value, onChange }) {
  return (
    <Campo label={label}>
      <Select
        options={[{ value: '', label: todos }, ...options]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{ padding: '10px 36px 10px 13px', fontSize: 14 }}
      />
    </Campo>
  );
}

/** As duas pontas do período. Sempre juntas — uma data só não é um intervalo. */
function Periodo({ valores, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <Campo label="De">
        <input type="date" value={valores.date_from} onChange={(e) => onChange('date_from', e.target.value)} style={inputStyle} />
      </Campo>
      <Campo label="Até">
        <input type="date" value={valores.date_to} onChange={(e) => onChange('date_to', e.target.value)} style={inputStyle} />
      </Campo>
    </div>
  );
}

/**
 * A caixa dos filtros.
 *
 * Eram oito droplists em fileira acima da lista. Enchiam meia tela de coisa que
 * quase sempre está vazia — e no telefone empurravam a lista para fora da
 * primeira dobra, de modo que a tela do histórico abria sem histórico nenhum.
 * Atrás de um ícone eles não somem: o próprio ícone diz quantos estão valendo.
 *
 * O que se mexe aqui é rascunho, e vale em "Aplicar". Aplicar campo a campo
 * dispararia uma consulta por droplist tocado — e, no meio de montar um recorte
 * de seis campos, cinco delas nascem obsoletas.
 */
function FiltrosModal({ open, onClose, view, valores, onAplicar, andares, responsaveis }) {
  const [rascunho, setRascunho] = useState(valores);

  const set = (campo, valor) => setRascunho((f) => ({ ...f, [campo]: valor }));

  function aplicar(proximo) {
    onAplicar(proximo);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Filtrar" maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
        <Filtro label="Andar" todos="Todos os andares" options={andares} value={rascunho.floor_id} onChange={(v) => set('floor_id', v)} />

        {view === 'OCORRENCIAS' && (
          <>
            <Filtro label="Tipo" todos="Todos os tipos" options={MAINTENANCE_TYPES} value={rascunho.maintenance_type} onChange={(v) => set('maintenance_type', v)} />
            <Filtro label="Categoria" todos="Todas as categorias" options={CATEGORIES} value={rascunho.category} onChange={(v) => set('category', v)} />
            <Filtro label="Prioridade" todos="Todas as prioridades" options={PRIORITIES} value={rascunho.priority} onChange={(v) => set('priority', v)} />
            <Filtro label="Status" todos="Todos os status" options={RECORD_STATUS} value={rascunho.status} onChange={(v) => set('status', v)} />
            <Filtro
              label="Responsável"
              todos="Todos os responsáveis"
              options={responsaveis.map((r) => ({ value: r.id, label: r.name }))}
              value={rascunho.responsible_id}
              onChange={(v) => set('responsible_id', v)}
            />
          </>
        )}

        <Periodo valores={rascunho} onChange={set} />

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {/* Limpar aplica na hora: quem quer a lista inteira de volta não
              deveria ter de limpar e depois confirmar que limpou. */}
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => aplicar(FILTROS_VAZIOS[view])}>
            Limpar
          </Button>
          <Button style={{ flex: 1 }} onClick={() => aplicar(rascunho)}>Aplicar</Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * A barra de procura e, ao lado dela, o ícone dos filtros.
 *
 * Os dois juntos porque respondem à mesma pergunta em dois graus: a busca é o
 * palpite ("carlos", "infiltração"), o ícone é o recorte exato. Separá-los faria
 * procurar em dois lugares o que é uma coisa só.
 *
 * O ícone muda de cor e ganha o número quando há recorte valendo. Sem isso, o
 * filtro escondido vira armadilha: a lista volta curta e nada na tela explica
 * por quê — que é justamente o risco de tirar os droplists da vista.
 */
function BuscaEFiltros({ view, busca, onBusca, ativos, onAbrirFiltros, style = {} }) {
  const placeholder = view === 'VISTORIAS'
    ? 'Procurar pelo nome de quem vistoriou…'
    : 'Procurar no que foi descrito…';
  const label = view === 'VISTORIAS'
    ? 'Procurar por quem vistoriou'
    : 'Procurar na descrição da ocorrência';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Search size={15} color={T.faint} style={{ position: 'absolute', left: 13, pointerEvents: 'none' }} />
        <input
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>

      <button
        type="button"
        onClick={onAbrirFiltros}
        // O número entra no nome do botão: quem não vê a tela precisa saber que
        // há recorte valendo, e a bolinha dourada não diz nada a um leitor.
        aria-label={ativos > 0 ? `Filtrar — ${ativos} ${ativos === 1 ? 'filtro aplicado' : 'filtros aplicados'}` : 'Filtrar'}
        title="Filtrar"
        style={{
          position: 'relative', flexShrink: 0,
          width: 40, height: 40, borderRadius: R.control, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ativos > 0 ? T.accentSoft : T.chip,
          color: ativos > 0 ? T.accentInk : T.mute,
          transition: 'background-color 0.15s, color 0.15s',
        }}
      >
        <SlidersHorizontal size={16} />
        {ativos > 0 && (
          <span
            aria-hidden="true"
            className="anim-pop-in"
            style={{
              position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 999, background: T.accent, color: T.onAccent,
              fontSize: 11, fontWeight: W.title, fontFamily: T.display,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // O anel da cor do cartão descola a bolinha do ícone embaixo dela.
              boxShadow: `0 0 0 2px ${T.card}`,
            }}
          >
            {ativos}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * As vistorias filtradas, em tabela.
 *
 * A tabela é a do painel do moderador, com duas colunas a mais: quantos andares
 * e quantas ocorrências saíram do dia. Num cartão de oito linhas elas não
 * cabiam; aqui são o que faz a lista responder sem abrir o relatório.
 */
function VistoriasTable({ lista, onAbrir }) {
  const { download, pendingId } = useExcelDownload();
  const shown = lista.isPaging ? [] : lista.rows;
  const colunas = ['Inspetor', 'Dia', 'Andares', 'Ocorrências', 'Planilha'];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${T.line}` }}>
          {colunas.map((c) => (
            <th key={c} style={{ textAlign: 'left', padding: '10px 22px', color: T.mute, fontSize: 12, fontWeight: W.body, position: 'sticky', top: 0, background: T.card }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody key={lista.page}>
        {lista.placeholders.map((i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
            {colunas.map((c) => (
              <td key={c} style={{ padding: '11px 22px' }}><Skeleton style={{ height: 14 }} /></td>
            ))}
          </tr>
        ))}

        {shown.map((r, idx) => (
          <tr
            key={r.id}
            onClick={() => onAbrir(r.id)}
            className={`anim-fade-in anim-d${Math.min(idx + 1, 6)}`}
            style={{ borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <td style={{ padding: '11px 22px', color: T.text, fontSize: 14 }}>{r.inspector?.name ?? '—'}</td>
            <td style={{ padding: '11px 22px', color: T.mute, fontSize: 14 }}>
              {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
            </td>
            <td style={{ padding: '11px 22px', color: T.mute, fontSize: 14 }}>
              {r.floor_form_entries?.length ?? 0}
            </td>
            <td style={{ padding: '11px 22px', color: T.mute, fontSize: 14 }}>{contarOcorrencias(r)}</td>
            <td style={{ padding: '11px 22px' }}>
              {r.has_excel ? (
                <button
                  type="button"
                  // O clique não sobe: a linha abre o relatório, e quem aperta
                  // "baixar" quer a planilha, não a caixa por cima dela.
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

        {lista.vazia && (
          <tr>
            <td colSpan={colunas.length} style={{ padding: '48px 22px', textAlign: 'center', color: T.mute, fontSize: 14 }}>
              {lista.emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** As mesmas vistorias no telefone: cartão por linha, sem tabela para rolar de lado. */
function VistoriasCards({ lista, onAbrir }) {
  const shown = lista.isPaging ? [] : lista.rows;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
      {lista.placeholders.map((i) => (
        <Skeleton key={i} style={{ height: 96, borderRadius: R.card }} />
      ))}

      {shown.map((r, idx) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onAbrir(r.id)}
          className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
          style={{
            background: T.chip, border: 'none', borderRadius: R.card, padding: 14,
            textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: T.text, fontWeight: W.title, fontSize: 14 }}>{r.inspector?.name ?? '—'}</span>
            <span style={{ color: T.mute, fontSize: 12 }}>
              {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </div>
          <span style={{ color: T.mute, fontSize: 12 }}>
            {r.floor_form_entries?.length ?? 0} andar(es) · {contarOcorrencias(r)} ocorrência(s)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {r.floor_form_entries?.map((e) => (
              <Badge key={e.floor_id} variant={e.status_geral === 'OK' ? 'success' : e.status_geral === 'ATENCAO' ? 'warning' : 'danger'}>
                {e.floor?.label || e.floor_id.slice(0, 6)}
              </Badge>
            ))}
          </div>
        </button>
      ))}

      {lista.vazia && (
        <p style={{ padding: '48px 0', textAlign: 'center', color: T.mute, fontSize: 14 }}>{lista.emptyMessage}</p>
      )}
    </div>
  );
}

/** Quantas ocorrências saíram do dia — a soma dos andares daquela vistoria. */
function contarOcorrencias(report) {
  return report.floor_form_entries?.reduce((sum, e) => sum + (e._count?.maintenance_records ?? 0), 0) ?? 0;
}

/**
 * As vistorias que a tela lista.
 *
 * Duas consultas, uma ligada: o ADMIN sem prédio escolhido lê o sistema inteiro
 * por `/inspections`, e o resto lê o histórico daquele prédio. Hook não pode ser
 * condicional, então as duas existem — mas só a que a tela usa vai à rede.
 */
function useVistoriasFiltradas(buildingId, filtros, ativa) {
  const params = preenchidos(filtros);
  // `ativa` é o miolo estar na tela. Sem isso, toda tela que traz o ícone de
  // ampliar pagaria a consulta do histórico ampliado a cada carregamento, para
  // um resultado que ninguém pediu — o mesmo cuidado do `enabled` em
  // `useInspections`.
  const doPredio = useBuildingHistory(buildingId, params, { pageSize: PAGE_SIZE, enabled: ativa });
  const doSistema = useInspections(params, ativa && !buildingId, PAGE_SIZE);

  const lista = buildingId ? doPredio : doSistema;
  const filtrando = Object.keys(params).length > 0;

  return {
    ...lista,
    vazia: !lista.isLoading && !lista.isPaging && lista.rows.length === 0,
    // Vazio por filtro e prédio sem vistoria nenhuma são coisas diferentes: a
    // primeira tem conserto à mão, e dizer "nenhuma ainda" mandaria a pessoa
    // procurar o problema no lugar errado.
    emptyMessage: filtrando ? 'Nenhuma vistoria com esses filtros' : 'Nenhuma vistoria por aqui ainda',
  };
}

/**
 * O miolo do histórico ampliado: a busca, os filtros, a lista e o rodapé.
 *
 * Não desenha moldura nenhuma — quem a põe é a caixa do computador ou a tela do
 * telefone. Ele só espera nascer dentro de uma coluna de altura definida: a
 * lista é o que rola, e a barra de busca e o rodapé ficam onde estão.
 */
export function HistoricoCompleto({ view, buildingId, ativa = true, isDesktop = false }) {
  // Um conjunto por visão: quem afunilou as ocorrências e foi ver as vistorias
  // não perde o recorte ao voltar.
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [busca, setBusca] = useState({ VISTORIAS: '', OCORRENCIAS: '' });
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [reportId, setReportId] = useState(null);

  // Andares e responsáveis só interessam aos droplists da caixa de filtros:
  // fora da tela, o miolo não pede nada à rede.
  const { data: floorsData } = useFloors(ativa ? buildingId : null);
  const { data: responsaveis = [] } = useBuildingResponsibles(ativa ? buildingId : null);
  const andares = sortFloorsDesc(floorsData?.floors ?? []).map((f) => ({ value: f.id, label: f.label }));

  const atual = filtros[view];
  const ativos = contarAtivos(atual);

  /**
   * O texto digitado espera o dedo parar antes de virar consulta.
   *
   * O campo continua respondendo a cada tecla — quem digita vê o que digitou —,
   * mas quem vai à rede é o valor assentado.
   */
  const buscaAssentada = useDebouncedValue(busca[view], 300);
  const params = preenchidos({ ...atual, q: buscaAssentada });

  const vistorias = useVistoriasFiltradas(buildingId, { ...atual, q: buscaAssentada }, ativa);
  const isVistorias = view === 'VISTORIAS';

  return (
    <>
      <BuscaEFiltros
        view={view}
        busca={busca[view]}
        onBusca={(v) => setBusca((b) => ({ ...b, [view]: v }))}
        ativos={ativos}
        onAbrirFiltros={() => setFiltrosAbertos(true)}
        style={{ padding: isDesktop ? '14px 22px' : '12px 16px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}
      />

      {/* A lista é o que rola; a busca e o rodapé ficam onde estão. */}
      <div key={view} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {isVistorias ? (
          isDesktop
            ? <VistoriasTable lista={vistorias} onAbrir={setReportId} />
            : <VistoriasCards lista={vistorias} onAbrir={setReportId} />
        ) : isDesktop ? (
          <OcorrenciasTable buildingId={buildingId} filters={params} pageSize={PAGE_SIZE} />
        ) : (
          <div style={{ padding: '14px 16px' }}>
            <OcorrenciasList buildingId={buildingId} filters={params} pageSize={PAGE_SIZE} />
          </div>
        )}
      </div>

      {/* O rodapé é só das vistorias: as duas listas de ocorrências trazem o
          delas junto com a lista. */}
      {isVistorias && (
        <Paginator
          page={vistorias.page}
          pages={vistorias.pages}
          total={vistorias.total}
          count={vistorias.rows.length}
          pageSize={vistorias.pageSize}
          onPrev={vistorias.prev}
          onNext={vistorias.next}
          isFetching={vistorias.isFetching}
          style={{ borderTop: `1px solid ${T.line}`, padding: isDesktop ? '12px 22px' : '10px 16px', flexShrink: 0 }}
        />
      )}

      {/* `key` na abertura: a caixa nasce com o que está valendo, e remontá-la a
          cada vez dispensa um efeito sincronizando rascunho e filtro. */}
      <FiltrosModal
        key={`${view}-${filtrosAbertos}`}
        open={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        view={view}
        valores={atual}
        onAplicar={(novos) => setFiltros((f) => ({ ...f, [view]: novos }))}
        andares={andares}
        responsaveis={responsaveis}
      />

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />
    </>
  );
}

/**
 * O histórico ampliado no computador: o miolo dentro de uma caixa.
 *
 * O alternador vem junto no topo porque, aberta a caixa, trocar de leitura sem
 * fechá-la é o gesto seguinte mais provável — e é o mesmo alternador do cartão,
 * então a escolha feita aqui continua valendo lá embaixo.
 */
export function HistoricoExpandidoModal({ open, onClose, view, onSelectView, buildingId }) {
  const { mounted, closing } = useExitTransition(open);
  const titulo = HISTORICO_VIEWS.find((v) => v.key === view)?.title ?? 'Histórico';

  if (!mounted) return null;

  return (
    <Dialog
      onClose={onClose}
      className={closing ? 'is-closing' : ''}
      aria-label={titulo}
      // Quase a janela inteira. O que sobra de fundo é só o bastante para a
      // caixa continuar sendo caixa — dá para ver que há tela por trás, e
      // clicar ali fecha. Cada ponto percentual a menos aqui é uma linha a
      // menos de lista, que é a única coisa que ela veio mostrar.
      style={{ width: '92vw', maxWidth: '92vw' }}
    >
      <div
        className={closing ? 'anim-scale-out' : 'anim-scale-in'}
        style={{
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: T.card, boxShadow: T.cardRing,
          height: '90vh', borderRadius: R.card,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
          <HistoricoSwitcher view={view} onSelect={onSelectView} title={titulo} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar o histórico ampliado"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </header>

        <HistoricoCompleto view={view} buildingId={buildingId} ativa={mounted} isDesktop />
      </div>
    </Dialog>
  );
}

/**
 * O ícone que amplia o cartão — e o que ele abre, que depende da largura.
 *
 * No computador, uma caixa sobre o cartão: quem ampliou continua no painel, e
 * fechar devolve exatamente o que estava embaixo. No telefone, uma tela com
 * endereço próprio.
 *
 * A escolha acontece no clique, e não na montagem: `useIsDesktop` responde
 * `false` no primeiro render — o servidor não tem largura —, e um elemento que
 * trocasse de natureza depois da hidratação piscaria a cada carga.
 */
export function AmpliarHistorico({ view, onSelectView, buildingId }) {
  const [aberto, setAberto] = useState(false);
  const isDesktop = useIsDesktop();
  const router = useRouter();

  function abrir() {
    if (isDesktop) {
      setAberto(true);
      return;
    }
    router.push(`${HISTORICO_COMPLETO_HREF}?view=${view}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Ampliar o histórico"
        title="Ampliar o histórico"
        className="transition-colors duration-150"
        style={{
          width: 34, height: 34, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T.chip, border: 'none', borderRadius: R.pill,
          color: T.mute, cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.mute; }}
      >
        <Maximize2 size={15} />
      </button>

      <HistoricoExpandidoModal
        open={aberto}
        onClose={() => setAberto(false)}
        view={view}
        onSelectView={onSelectView}
        buildingId={buildingId}
      />
    </>
  );
}
