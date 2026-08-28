'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FilterX, Maximize2, Search, X } from 'lucide-react';
import { Badge, Dialog, Select, Skeleton } from '@/app/components/ui';
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
 * clicando página por página até achar, e é por isso que a lista precisava de
 * uma tela maior em vez de mais linhas.
 *
 * Ampliar, e não navegar: a resposta dessa pergunta é uma consulta, não um
 * lugar. Numa tela própria, quem chega precisaria escolher prédio e visão de
 * novo; aqui a caixa abre já no histórico que estava aberto no cartão, e fechar
 * devolve exatamente o que estava embaixo.
 *
 * Vinte linhas por página, e não oito: aqui não há calendário ao lado para
 * empurrar, e o que decide a altura é a janela.
 */
const PAGE_SIZE = 20;

/** Do que é feita a filtragem de cada visão — o vazio que "limpar" restaura. */
const FILTROS_VAZIOS = {
  VISTORIAS: { q: '', floor_id: '', date_from: '', date_to: '' },
  OCORRENCIAS: {
    q: '',
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

/**
 * A barra de procura.
 *
 * Larga e sozinha na primeira linha porque é a pergunta mais frequente das
 * duas telas: nas vistorias, o nome de quem vistoriou; nas ocorrências, uma
 * palavra do que foi descrito. Os droplists abaixo afunilam o que ela trouxe.
 */
function Busca({ value, onChange, placeholder, label }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search size={15} color={T.faint} style={{ position: 'absolute', left: 13, pointerEvents: 'none' }} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        style={{ ...inputStyle, paddingLeft: 36 }}
      />
    </div>
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
function Periodo({ filtros, onChange }) {
  return (
    <>
      <Campo label="De">
        <input type="date" value={filtros.date_from} onChange={(e) => onChange('date_from', e.target.value)} style={inputStyle} />
      </Campo>
      <Campo label="Até">
        <input type="date" value={filtros.date_to} onChange={(e) => onChange('date_to', e.target.value)} style={inputStyle} />
      </Campo>
    </>
  );
}

/**
 * A caixa de filtros.
 *
 * Fica aberta, e não atrás de um botão: numa tela que existe para filtrar,
 * esconder o filtro é esconder a tela. O contador e o "limpar" só aparecem
 * quando há o que limpar — antes disso seriam dois enfeites.
 */
function BarraDeFiltros({ children, busca, ativos, onLimpar }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${T.line}` }}>
      {busca}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {children}
      </div>

      {ativos > 0 && (
        <div className="anim-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: T.mute, fontSize: 12 }}>
            {ativos} {ativos === 1 ? 'filtro aplicado' : 'filtros aplicados'}
          </span>
          <button
            type="button"
            onClick={onLimpar}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, background: T.chip,
              border: 'none', borderRadius: R.pill, padding: '6px 12px', cursor: 'pointer',
              color: T.text, fontSize: 12, fontFamily: T.display,
            }}
          >
            <FilterX size={13} /> Limpar filtros
          </button>
        </div>
      )}
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
 * As vistorias que a caixa lista.
 *
 * Duas consultas, uma ligada: o ADMIN sem prédio escolhido lê o sistema inteiro
 * por `/inspections`, e o resto lê o histórico daquele prédio. Hook não pode ser
 * condicional, então as duas existem — mas só a que a tela usa vai à rede.
 */
function useVistoriasFiltradas(buildingId, filtros, ativa) {
  const params = preenchidos(filtros);
  // `ativa` é a caixa estar na tela. Sem isso, toda tela que traz o ícone de
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
 * O histórico ampliado: a caixa, os filtros e a lista.
 *
 * O alternador vem junto no topo porque, aberta a caixa, trocar de leitura sem
 * fechá-la é o gesto seguinte mais provável — e é o mesmo alternador do cartão,
 * então a escolha feita aqui continua valendo lá embaixo.
 */
export function HistoricoExpandidoModal({ open, onClose, view, onSelectView, buildingId }) {
  const { mounted, closing } = useExitTransition(open);
  const isDesktop = useIsDesktop();

  // Um conjunto por visão: quem afunilou as ocorrências e foi ver as vistorias
  // não perde o recorte ao voltar.
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [reportId, setReportId] = useState(null);

  // Andares e responsáveis só interessam aos droplists, que só existem com a
  // caixa aberta: fechada, ela não pede nada à rede.
  const { data: floorsData } = useFloors(mounted ? buildingId : null);
  const { data: responsaveis = [] } = useBuildingResponsibles(mounted ? buildingId : null);
  const andares = sortFloorsDesc(floorsData?.floors ?? []).map((f) => ({ value: f.id, label: f.label }));

  const atual = filtros[view];
  const set = (campo, valor) => setFiltros((f) => ({ ...f, [view]: { ...f[view], [campo]: valor } }));
  const limpar = () => setFiltros((f) => ({ ...f, [view]: FILTROS_VAZIOS[view] }));
  const ativos = Object.values(atual).filter((v) => v !== '').length;

  /**
   * O texto digitado espera o dedo parar antes de virar consulta.
   *
   * O campo continua respondendo a cada tecla — quem digita vê o que digitou —,
   * mas quem vai à rede é o valor assentado.
   */
  const buscaAssentada = useDebouncedValue(atual.q, 300);
  const filtrosDaConsulta = { ...atual, q: buscaAssentada };

  const vistorias = useVistoriasFiltradas(buildingId, filtrosDaConsulta, mounted);

  const titulo = HISTORICO_VIEWS.find((v) => v.key === view)?.title ?? 'Histórico';

  if (!mounted) return null;

  const isVistorias = view === 'VISTORIAS';

  return (
    <>
      <Dialog
        onClose={onClose}
        className={`${closing ? 'is-closing' : ''} ${isDesktop ? '' : 'dialog--full'}`}
        aria-label={titulo}
        // 80% da janela no computador, como pedido. No telefone é a tela
        // inteira: 80% de 390px de largura sobra margem para o fundo e tira
        // justamente da lista, que é a única coisa que a caixa veio mostrar.
        // É a mesma escolha do relatório do dia (ver ReportDocumentModal).
        style={
          isDesktop
            ? { width: '80vw', maxWidth: '80vw' }
            : { width: '100vw', maxWidth: '100vw', height: '100vh' }
        }
      >
        <div
          className={closing ? 'anim-scale-out' : 'anim-scale-in'}
          style={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: T.card, boxShadow: T.cardRing,
            height: isDesktop ? '80vh' : '100vh',
            borderRadius: isDesktop ? R.card : 0,
          }}
        >
          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 22px', borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
            <HistoricoSwitcher view={view} onSelect={onSelectView} title={titulo} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar o histórico ampliado"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: isDesktop ? 4 : 8, display: 'flex', flexShrink: 0 }}
            >
              <X size={isDesktop ? 18 : 20} />
            </button>
          </header>

          {isVistorias ? (
            <BarraDeFiltros
              ativos={ativos}
              onLimpar={limpar}
              busca={
                <Busca
                  value={atual.q}
                  onChange={(v) => set('q', v)}
                  label="Procurar por quem vistoriou"
                  placeholder="Procurar pelo nome de quem vistoriou…"
                />
              }
            >
              <Filtro label="Andar" todos="Todos os andares" options={andares} value={atual.floor_id} onChange={(v) => set('floor_id', v)} />
              <Periodo filtros={atual} onChange={set} />
            </BarraDeFiltros>
          ) : (
            <BarraDeFiltros
              ativos={ativos}
              onLimpar={limpar}
              busca={
                <Busca
                  value={atual.q}
                  onChange={(v) => set('q', v)}
                  label="Procurar na descrição da ocorrência"
                  placeholder="Procurar no que foi descrito…"
                />
              }
            >
              <Filtro label="Andar" todos="Todos os andares" options={andares} value={atual.floor_id} onChange={(v) => set('floor_id', v)} />
              <Filtro label="Tipo" todos="Todos os tipos" options={MAINTENANCE_TYPES} value={atual.maintenance_type} onChange={(v) => set('maintenance_type', v)} />
              <Filtro label="Categoria" todos="Todas as categorias" options={CATEGORIES} value={atual.category} onChange={(v) => set('category', v)} />
              <Filtro label="Prioridade" todos="Todas as prioridades" options={PRIORITIES} value={atual.priority} onChange={(v) => set('priority', v)} />
              <Filtro label="Status" todos="Todos os status" options={RECORD_STATUS} value={atual.status} onChange={(v) => set('status', v)} />
              <Filtro
                label="Responsável"
                todos="Todos os responsáveis"
                options={responsaveis.map((r) => ({ value: r.id, label: r.name }))}
                value={atual.responsible_id}
                onChange={(v) => set('responsible_id', v)}
              />
              <Periodo filtros={atual} onChange={set} />
            </BarraDeFiltros>
          )}

          {/* A lista é o que rola; cabeçalho, filtros e rodapé ficam onde estão. */}
          <div key={view} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {isVistorias ? (
              isDesktop
                ? <VistoriasTable lista={vistorias} onAbrir={setReportId} />
                : <VistoriasCards lista={vistorias} onAbrir={setReportId} />
            ) : isDesktop ? (
              <OcorrenciasTable buildingId={buildingId} filters={preenchidos(filtrosDaConsulta)} pageSize={PAGE_SIZE} />
            ) : (
              <div style={{ padding: '14px 16px' }}>
                <OcorrenciasList buildingId={buildingId} filters={preenchidos(filtrosDaConsulta)} pageSize={PAGE_SIZE} />
              </div>
            )}
          </div>

          {/* O rodapé é só das vistorias: as duas listas de ocorrências trazem o
              delas junto com a tabela. */}
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
              style={{ borderTop: `1px solid ${T.line}`, padding: '12px 22px', flexShrink: 0 }}
            />
          )}
        </div>
      </Dialog>

      <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />
    </>
  );
}

/**
 * O ícone que amplia o cartão, e a caixa que ele abre.
 *
 * As duas coisas moram juntas porque quem as usa não tem o que decidir entre
 * elas: a tela põe isto no canto do cabeçalho do histórico e acabou. O estado
 * de aberto é daqui — a tela por baixo não muda em nada por causa dele.
 */
export function AmpliarHistorico({ view, onSelectView, buildingId }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
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
