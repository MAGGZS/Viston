'use client';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronDown, Plus, Snowflake } from 'lucide-react';
import { Button, Skeleton } from '@/app/components/ui';
import { CalendarioMensal, LegendaAgenda } from '@/app/components/agenda/CalendarioMensal';
import { ScheduleListItem } from '@/app/components/agenda/ScheduleListItem';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';
import { FormularioAgendamento } from '@/app/components/agenda/FormularioAgendamento';
import { useBuildingSchedules, useOverdueSchedules } from '@/app/hooks/useApi';
import {
  SCHEDULE_STATES,
  dateKeyOf,
  estiloMarca,
  formatDiaExtenso,
  formatMesAno,
  groupSchedulesByDay,
  parseDateKey,
  resumoAtrasos,
  scheduleState,
  sortByUrgency,
  toDateKey,
} from '@/app/lib/agenda';
import { T, R, W, NUM } from '@/app/lib/theme';

/** Os recortes da lista do mês, na ordem em que aparecem. */
export const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'atrasado', label: 'Atrasados' },
  { id: 'concluido', label: 'Concluídos' },
  { id: 'cancelado', label: 'Cancelados' },
];

/** Quantos chips cabem na célula do calendário antes do "+N". */
const MAX_CHIPS = 3;

const EASE_SAIDA = 'cubic-bezier(0.23, 1, 0.32, 1)';

const editavel = (s) => s.status === 'PENDENTE';

/** "Carlos Andrade" → "Carlos A." — o que cabe numa célula de 60px. */
function nomeCurto(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? 'Inspetor';
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

/** Cronológico; no mesmo dia, o mais urgente primeiro. */
function ordenarPorData(lista) {
  return sortByUrgency(lista).sort((a, b) =>
    dateKeyOf(a.scheduled_date) < dateKeyOf(b.scheduled_date) ? -1 : dateKeyOf(a.scheduled_date) > dateKeyOf(b.scheduled_date) ? 1 : 0
  );
}

/**
 * Faz o conteúdo do painel entrar quando ele troca de assunto.
 *
 * Curto (200ms) e com saída rápida: é uma troca que se faz várias vezes por
 * sessão, e o percurso existe só para dizer de que lado veio — o formulário
 * entra pela direita, a lista volta pela esquerda. Com "reduzir movimento",
 * fica só o esmaecer, que não desloca nada. Pela Web Animations API, como a
 * pílula da barra lateral: não deixa transform retido no elemento.
 */
function useEntradaDoPainel(chave, direcao) {
  const ref = useRef(null);
  const primeira = useRef(true);

  useLayoutEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const dx = direcao === 'voltar' ? -12 : 12;
    el.animate(
      reduzir
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: reduzir ? 120 : 200, easing: EASE_SAIDA }
    );
  }, [chave, direcao]);

  return ref;
}

/** Os chips de uma célula do calendário: quem vai e em que pé está. */
function ChipsDoDia({ marks }) {
  if (!marks?.length) return null;
  const lista = sortByUrgency(marks);
  const visiveis = lista.length > MAX_CHIPS ? lista.slice(0, MAX_CHIPS - 1) : lista;
  const resto = lista.length - visiveis.length;

  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {visiveis.map((s) => {
        const estado = scheduleState(s);
        const cancelado = estado === 'cancelado';
        return (
          <span
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, minWidth: 0,
              padding: '2px 6px 2px 4px', borderRadius: 6,
              background: T.card, fontSize: 11, lineHeight: '15px',
              color: cancelado ? T.faint : T.text,
            }}
          >
            <span style={{ width: 4, height: 11, borderRadius: 2, flexShrink: 0, ...estiloMarca(estado, { espessura: 1 }) }} />
            <span
              style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textDecoration: cancelado ? 'line-through' : 'none',
              }}
            >
              {nomeCurto(s.inspector?.name)}
            </span>
          </span>
        );
      })}
      {resto > 0 && (
        <span style={{ fontSize: 11, lineHeight: '15px', fontWeight: W.strong, color: T.mute, paddingLeft: 4, ...NUM }}>
          +{resto}
        </span>
      )}
    </span>
  );
}

/**
 * O alerta fixo do topo da agenda: os agendamentos atrasados de qualquer mês.
 *
 * Não é `role="alert"`: ele fica na tela enquanto houver atraso, e um alerta
 * de verdade seria lido por cima de tudo a cada nova busca. É uma região com
 * nome, e só a frase da contagem é `aria-live` educado — muda o número, o
 * leitor de tela fala o número, e nada mais.
 *
 * Fechado por padrão: a contagem já diz o que importa, e a lista (que pode ter
 * meses de atraso) empurraria o calendário para baixo em toda visita. Clicar
 * num item leva o calendário ao dia dele; o lápis, a quem pode, edita.
 *
 * Movimento: entra com um esmaecer e 4px de descida (200ms, saída forte) e a
 * lista abre do mesmo jeito. Com "reduzir movimento", só o esmaecer.
 */
export function AlertaDeAtrasos({ schedules = [], onAbrir, onEditar }) {
  const [aberto, setAberto] = useState(false);
  const listaId = useId();
  const caixaRef = useRef(null);
  const listaRef = useRef(null);
  const lista = useMemo(() => sortByUrgency(schedules), [schedules]);
  const { total, prazoVencido, titulo, detalhe } = resumoAtrasos(lista);
  const visivel = total > 0;

  useLayoutEffect(() => {
    if (visivel) animarEntrada(caixaRef.current);
  }, [visivel]);

  useLayoutEffect(() => {
    if (aberto) animarEntrada(listaRef.current);
  }, [aberto]);

  if (!visivel) return null;
  const grave = prazoVencido > 0;

  return (
    <section
      ref={caixaRef}
      aria-label="Vistorias atrasadas"
      style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, marginBottom: 20, overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px' }}>
        <span
          aria-hidden="true"
          style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: grave ? T.dangerSoft : T.accentSoft, color: grave ? T.danger : T.accentInk,
          }}
        >
          <AlertTriangle size={16} />
        </span>
        <p aria-live="polite" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 14, color: T.text, ...NUM }}>
          <span style={{ fontWeight: W.strong }}>{titulo}</span>
          {detalhe && <span style={{ color: T.danger, fontWeight: W.strong }}> · {detalhe}</span>}
          <span style={{ color: T.mute, fontSize: 13 }}> · o dia agendado passou sem vistoria</span>
        </p>
        <button
          type="button"
          className="press"
          aria-expanded={aberto}
          aria-controls={listaId}
          onClick={() => setAberto((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
            minHeight: 36, padding: '6px 12px', borderRadius: R.control,
            border: 'none', background: T.chip, color: T.text,
            font: 'inherit', fontSize: 13, fontWeight: W.strong, cursor: 'pointer',
          }}
        >
          {aberto ? 'Ocultar' : 'Ver atrasadas'}
          <ChevronDown
            size={15}
            aria-hidden="true"
            style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-saida)' }}
          />
        </button>
      </div>
      <div id={listaId} hidden={!aberto}>
        {aberto && (
          <div
            ref={listaRef}
            style={{ borderTop: `1px solid ${T.line}`, maxHeight: 280, overflowY: 'auto', padding: '4px 8px 8px' }}
          >
            <ListaDeAgendamentos lista={lista} onAbrir={onAbrir} onEditar={onEditar} />
          </div>
        )}
      </div>
    </section>
  );
}

/** O esmaecer com 4px de descida do alerta; com "reduzir movimento", só o esmaecer. */
function animarEntrada(el) {
  if (!el || typeof el.animate !== 'function') return;
  const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  el.animate(
    reduzir
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: reduzir ? 120 : 200, easing: EASE_SAIDA }
  );
}

function CabecalhoDoPainel({ titulo, subtitulo, onVoltar, acoes }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: onVoltar ? '12px 12px 8px 8px' : '16px 16px 8px', flexShrink: 0 }}>
      {onVoltar && (
        <button type="button" className="icone-btn icone-btn--compacto" aria-label="Voltar para a lista" onClick={onVoltar}>
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text, margin: 0 }}>{titulo}</h2>
        {subtitulo && (
          <p style={{ fontSize: 12, color: T.mute, marginTop: 2, textTransform: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitulo}
          </p>
        )}
      </div>
      {acoes}
    </div>
  );
}

function ListaDeAgendamentos({ lista, onAbrir, onEditar }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {lista.map((s) => (
        <li key={s.id}>
          <ScheduleListItem
            schedule={s}
            onClick={onAbrir}
            onEdit={onEditar && editavel(s) ? onEditar : undefined}
          />
        </li>
      ))}
    </ul>
  );
}

function FiltroDeStatus({ valor, onChange, contagens }) {
  return (
    <div role="group" aria-label="Filtrar por status" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {FILTROS.map((f) => {
        const ativo = valor === f.id;
        return (
          <button
            key={f.id}
            type="button"
            className="press"
            aria-pressed={ativo}
            onClick={() => onChange(f.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              minHeight: 30, padding: '4px 10px', borderRadius: R.badge,
              border: 'none', font: 'inherit', fontSize: 12, cursor: 'pointer',
              background: ativo ? T.accent : T.chip,
              color: ativo ? T.onAccent : T.text,
              fontWeight: ativo ? W.strong : W.body,
              boxShadow: ativo ? `inset 0 0 0 1px ${T.accentEdge}` : 'none',
              transition: 'background-color 150ms ease, color 150ms ease, transform 160ms var(--ease-saida)',
            }}
          >
            {f.label}
            <span style={{ ...NUM, fontSize: 11, opacity: 0.75 }}>{contagens[f.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A agenda de vistorias de um prédio — a mesma tela para o gestor e para o
 * visualizador, que é quem supervisiona os inspetores.
 *
 * Calendário grande à esquerda; à direita, um painel que alterna entre a lista
 * do mês e o formulário. Alternar no mesmo lugar, e não abrir gaveta por cima,
 * é o que deixa o calendário à vista enquanto se escolhe a data: o dia aceso
 * na grade é a data do formulário, e mexer num muda o outro.
 *
 * Props:
 * - `buildingId`.
 * - `canEdit`: pode agendar e alterar (gestor e visualizador).
 * - `frozen`: prédio inativo — a agenda fica só leitura, como o servidor exige.
 * - `initialDate` (`yyyy-MM-dd`) e `initialScheduleId`: abrem a agenda num mês
 *   e, se o agendamento estiver nele, já com a edição aberta — é o caminho do
 *   lápis do calendário do painel.
 */
export function AgendaPredio({ buildingId, canEdit = false, frozen = false, initialDate, initialScheduleId }) {
  const hoje = toDateKey(new Date());
  const [inicio] = useState(() => parseDateKey(initialDate) ?? new Date());
  const [month, setMonth] = useState(inicio.getMonth() + 1);
  const [year, setYear] = useState(inicio.getFullYear());
  /**
   * O que o painel da direita mostra:
   * `{ modo: 'lista' }`, `{ modo: 'dia', date }` (só leitura),
   * `{ modo: 'novo', date }` ou `{ modo: 'editar', date, schedule }`.
   */
  const [painel, setPainel] = useState({ modo: 'lista' });
  const [direcao, setDirecao] = useState('ir');
  const [filtro, setFiltro] = useState('todos');
  const [detalhe, setDetalhe] = useState(null);
  // Cada "novo" a partir da lista é um formulário limpo; trocar de dia com o
  // formulário aberto não é — os andares escolhidos ficam.
  const [rodada, setRodada] = useState(0);
  const [pedidoInicial, setPedidoInicial] = useState(initialScheduleId ?? null);

  const podeEscrever = canEdit && !frozen;

  const { data, isLoading, isError, refetch, isFetching } = useBuildingSchedules(buildingId, { month, year });
  const { data: dadosAtrasados } = useOverdueSchedules(buildingId);
  const atrasadosDeTodosOsMeses = useMemo(() => dadosAtrasados?.schedules ?? [], [dadosAtrasados]);
  const schedules = useMemo(() => data?.schedules ?? [], [data]);
  const porDia = useMemo(() => groupSchedulesByDay(schedules), [schedules]);

  // O lápis do painel chega aqui com o id na URL: abre a edição assim que o
  // agendamento aparece na lista do mês. Ajuste no render, e não em efeito —
  // é estado derivado de dado que acabou de chegar.
  if (pedidoInicial && data) {
    const alvo = schedules.find((s) => s.id === pedidoInicial);
    setPedidoInicial(null);
    if (alvo && podeEscrever && editavel(alvo)) {
      setPainel({ modo: 'editar', date: dateKeyOf(alvo.scheduled_date), schedule: alvo });
    } else if (alvo) {
      setDetalhe(alvo);
    }
  }

  const contagens = useMemo(() => {
    const c = { todos: schedules.length, pendente: 0, atrasado: 0, concluido: 0, cancelado: 0 };
    // Prazo vencido conta em "Atrasados" e concluído com atraso em "Concluídos":
    // os recortes são do que se faz com o agendamento, não do tom do atraso.
    for (const s of schedules) c[SCHEDULE_STATES[scheduleState(s)].filtro] += 1;
    return c;
  }, [schedules]);

  const listaDoMes = useMemo(() => {
    const filtrada = filtro === 'todos' ? schedules : schedules.filter((s) => SCHEDULE_STATES[scheduleState(s)].filtro === filtro);
    return ordenarPorData(filtrada);
  }, [schedules, filtro]);

  const chavePainel =
    painel.modo === 'lista' ? 'lista'
      : painel.modo === 'dia' ? `dia:${painel.date}`
        : painel.modo === 'novo' ? `novo:${rodada}`
          : `editar:${painel.schedule.id}`;
  const painelRef = useEntradaDoPainel(chavePainel, direcao);

  function irPara(dateKey) {
    const d = parseDateKey(dateKey);
    if (!d) return;
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) {
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
    }
  }

  /** Item do alerta: o calendário vai ao mês e ao dia do agendamento. */
  function abrirDoAlerta(schedule) {
    const date = dateKeyOf(schedule.scheduled_date);
    if (!date) return;
    irPara(date);
    setDirecao('ir');
    setPainel({ modo: 'dia', date });
  }

  function voltarParaLista() {
    setDirecao('voltar');
    setPainel({ modo: 'lista' });
  }

  function abrirNovo(dateKey) {
    setDirecao('ir');
    setRodada((r) => r + 1);
    setPainel({ modo: 'novo', date: dateKey });
    irPara(dateKey);
  }

  function abrirEdicao(schedule) {
    if (!podeEscrever || !editavel(schedule)) {
      setDetalhe(schedule);
      return;
    }
    setDetalhe(null);
    setDirecao('ir');
    const date = dateKeyOf(schedule.scheduled_date);
    setPainel({ modo: 'editar', date, schedule });
    irPara(date);
  }

  /**
   * Clique num dia.
   *
   * De hoje em diante, com permissão: o formulário para aquele dia, com os
   * agendamentos que ele já tem listados por cima. Com o formulário de novo
   * agendamento aberto, só a data troca. Dia passado (ou sem permissão) não
   * recebe agendamento novo: o painel mostra o que houve nele.
   */
  function escolherDia(key) {
    if (!podeEscrever || key < hoje) {
      if (painel.modo === 'dia' && painel.date === key) {
        voltarParaLista();
        return;
      }
      setDirecao('ir');
      setPainel({ modo: 'dia', date: key });
      return;
    }
    if (painel.modo === 'novo') {
      setPainel({ ...painel, date: key });
      return;
    }
    abrirNovo(key);
  }

  function mudarData(key) {
    setPainel((p) => ({ ...p, date: key }));
    irPara(key);
  }

  const selecionado = painel.modo === 'lista' ? null : painel.date;
  const doDia = selecionado ? ordenarPorData(porDia[selecionado] ?? []) : [];
  const nomeDoMes = formatMesAno(month, year);
  const atrasados = contagens.atrasado;

  let conteudo;
  if (painel.modo === 'lista') {
    conteudo = (
      <>
        <CabecalhoDoPainel
          titulo="Agendamentos do mês"
          subtitulo={nomeDoMes}
        />
        <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          <FiltroDeStatus valor={filtro} onChange={setFiltro} contagens={contagens} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }} aria-busy={isLoading || undefined}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px' }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 56, borderRadius: R.card }} />)}
            </div>
          ) : isError ? (
            <div role="alert" style={{ padding: '24px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: T.text, margin: 0 }}>Não foi possível carregar a agenda.</p>
              <Button variant="secondary" onClick={() => refetch()} style={{ marginTop: 12, padding: '8px 16px', fontSize: 13 }}>
                Tentar de novo
              </Button>
            </div>
          ) : listaDoMes.length === 0 ? (
            <div style={{ padding: '28px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: T.text, fontWeight: W.strong, margin: 0 }}>
                {filtro === 'todos' ? 'Nenhuma vistoria agendada neste mês' : `Nenhum agendamento ${SCHEDULE_STATES[filtro].label.toLowerCase()} neste mês`}
              </p>
              {filtro === 'todos' && podeEscrever && (
                <p style={{ fontSize: 13, color: T.mute, marginTop: 6, lineHeight: 1.5 }}>
                  Clique num dia do calendário ou em “Agendar” para marcar a primeira.
                </p>
              )}
            </div>
          ) : (
            <ListaDeAgendamentos lista={listaDoMes} onAbrir={setDetalhe} onEditar={podeEscrever ? abrirEdicao : undefined} />
          )}
        </div>
        <div style={{ borderTop: `1px solid ${T.line}`, padding: '12px 16px', flexShrink: 0 }}>
          <LegendaAgenda states={['pendente', 'atrasado', 'prazo_vencido', 'concluido', 'cancelado']} />
        </div>
      </>
    );
  } else if (painel.modo === 'dia') {
    const passado = painel.date < hoje;
    conteudo = (
      <>
        <CabecalhoDoPainel
          titulo="Agenda do dia"
          subtitulo={formatDiaExtenso(painel.date)}
          onVoltar={voltarParaLista}
        />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 12px' }}>
          {doDia.length > 0 ? (
            <ListaDeAgendamentos lista={doDia} onAbrir={setDetalhe} onEditar={podeEscrever ? abrirEdicao : undefined} />
          ) : (
            <p style={{ fontSize: 14, color: T.mute, padding: '20px 8px', textAlign: 'center', margin: 0 }}>
              Nenhuma vistoria agendada neste dia.
            </p>
          )}
          {canEdit && passado && (
            <p style={{ fontSize: 12, color: T.faint, padding: '8px 8px 0', lineHeight: 1.5, margin: 0 }}>
              Dias que já passaram não recebem agendamento novo.
            </p>
          )}
        </div>
      </>
    );
  } else {
    const editando = painel.modo === 'editar';
    const existentes = editando ? [] : doDia;
    conteudo = (
      <>
        <CabecalhoDoPainel
          titulo={editando ? 'Editar agendamento' : 'Nova vistoria'}
          subtitulo={formatDiaExtenso(painel.date)}
          onVoltar={voltarParaLista}
        />
        <FormularioAgendamento
          key={editando ? `e:${painel.schedule.id}` : `n:${rodada}`}
          buildingId={buildingId}
          schedule={editando ? painel.schedule : null}
          date={painel.date}
          onDateChange={mudarData}
          onDone={voltarParaLista}
          disabled={!podeEscrever}
          antes={
            existentes.length > 0 && (
              <section aria-label="Já agendado neste dia" style={{ background: T.chip, borderRadius: R.card, padding: '10px 4px 4px' }}>
                <p style={{ fontSize: 12, fontWeight: W.strong, color: T.mute, margin: '0 10px 4px' }}>
                  Já agendado neste dia · {existentes.length}
                </p>
                <ListaDeAgendamentos lista={existentes} onAbrir={setDetalhe} onEditar={abrirEdicao} />
              </section>
            )
          }
        />
      </>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 32px 32px' }}>
      <AlertaDeAtrasos
        schedules={atrasadosDeTodosOsMeses}
        onAbrir={abrirDoAlerta}
        onEditar={podeEscrever ? abrirEdicao : undefined}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) clamp(300px, 28vw, 380px)',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        {/* Calendário */}
        <section
          aria-label="Calendário da agenda"
          className="anim-fade-up"
          style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, minWidth: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: T.mute, margin: 0, ...NUM }} aria-live="polite">
              {isLoading ? 'Carregando agenda…' : (
                <>
                  {contagens.todos} agendamento{contagens.todos !== 1 ? 's' : ''} em {nomeDoMes.toLowerCase()}
                  {atrasados > 0 && (
                    <span style={{ color: T.text, fontWeight: W.strong }}> · {atrasados} atrasado{atrasados !== 1 ? 's' : ''}</span>
                  )}
                  {isFetching && !isLoading && <span className="so-leitor"> (atualizando)</span>}
                </>
              )}
            </p>
            {canEdit && (
              <Button
                onClick={() => abrirNovo(hoje)}
                disabled={frozen}
                title={frozen ? 'Prédio inativo: a agenda está só para leitura' : undefined}
                style={{ padding: '10px 16px', flexShrink: 0 }}
              >
                <Plus size={16} aria-hidden="true" /> Agendar
              </Button>
            )}
          </div>

          <CalendarioMensal
            size="large"
            month={month}
            year={year}
            onMonthChange={(m, y) => { setMonth(m); setYear(y); }}
            selectedDate={selecionado}
            onSelectDate={escolherDia}
            marks={porDia}
            renderDayContent={(_key, marks) => <ChipsDoDia marks={marks} />}
            label="Agenda de vistorias do prédio"
          />
        </section>

        {/* Painel da direita: lista do mês, dia, ou formulário */}
        <aside
          aria-label="Agendamentos"
          className="anim-fade-up anim-d1"
          style={{
            position: 'relative', minHeight: 560,
            background: T.card, borderRadius: R.card, boxShadow: T.cardRing, overflow: 'hidden',
          }}
        >
          <div ref={painelRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            {frozen && canEdit && (
              <p
                role="status"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, margin: '12px 12px 0', padding: '8px 12px',
                  borderRadius: R.card, background: T.accentSoft, color: T.accentInk, fontSize: 12, lineHeight: 1.45, flexShrink: 0,
                }}
              >
                <Snowflake size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                Prédio inativo: a agenda está só para leitura.
              </p>
            )}
            {conteudo}
          </div>
        </aside>
      </div>

      <ScheduleDetailsModal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        schedules={detalhe ? [detalhe] : []}
        showBuilding={false}
        onEdit={podeEscrever ? abrirEdicao : undefined}
      />
    </div>
  );
}
