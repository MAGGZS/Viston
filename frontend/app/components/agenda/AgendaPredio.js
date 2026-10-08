'use client';
import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, PanelRightClose, PanelRightOpen, Pin, Plus, Snowflake, UserX, X } from 'lucide-react';
import { Button, Skeleton } from '@/app/components/ui';
import { CalendarioMensal, LegendaAgenda } from '@/app/components/agenda/CalendarioMensal';
import { ScheduleListItem } from '@/app/components/agenda/ScheduleListItem';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';
import { FormularioAgendamento } from '@/app/components/agenda/FormularioAgendamento';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { useBuildingSchedules } from '@/app/hooks/useApi';
import { useUnsavedFlag } from '@/app/hooks/useUnsavedGuard';
import { MODAL_EXIT_MS } from '@/app/hooks/useExitTransition';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import {
  SCHEDULE_STATES,
  dateKeyOf,
  estiloMarca,
  formatDiaExtenso,
  formatMesAno,
  groupSchedulesByDay,
  parseDateKey,
  scheduleState,
  sortByUrgency,
  toDateKey,
} from '@/app/lib/agenda';
import { T, R, W, NUM } from '@/app/lib/theme';

/** Os recortes da lista do mês, na ordem em que aparecem. */
export const FILTROS = [
  { id: 'todos', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'atrasado', label: 'Atrasadas' },
  { id: 'concluido', label: 'Concluídas' },
  { id: 'cancelado', label: 'Canceladas' },
];

/** Quantos chips cabem na célula do calendário antes do "+N". */
const MAX_CHIPS = 3;

const EASE_SAIDA = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Esconder e fixar o painel da direita.
 *
 * A coluna anima `grid-template-columns` (e o vão), não um FLIP com escala:
 * a célula do calendário é texto com reticências e chips, e escalar a seção
 * achataria letra, raio e sombra — a contraescala teria de ser recalculada
 * a cada quadro em dezenas de chips. Reflow de uma grade de 42 botões por
 * quadro é barato, e o texto só reflui, nunca distorce. O painel recolhe
 * como cortina: o conteúdo fica preso à borda direita com a largura final, e
 * a borda esquerda dele anda junto com a do calendário.
 *
 * Curva de gaveta do produto (`--ease-drawer`): arranca na hora, que é o que
 * um clique pede, e assenta sem repique.
 */
const LARGURA_PAINEL = 'clamp(300px, 28vw, 380px)';
const EASE_GAVETA = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURACAO_COLUNA = 280;
const REDUZIR = '(prefers-reduced-motion: reduce)';

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

/**
 * Os chips de uma célula do calendário: quem vai e em que pé está.
 *
 * A marca de status é a mesma bolinha da legenda. Era uma barrinha de 4×11px,
 * e a do pendente (vazada) se lia como "▯" — um glifo que a fonte não tem —
 * na frente do nome. `selecionado`: o "+N" vai sobre o dourado do dia
 * escolhido, e ali o cinza não tem contraste.
 */
function ChipsDoDia({ marks, selecionado = false }) {
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
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, ...estiloMarca(estado, { espessura: 1.5 }) }} />
            <span
              style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textDecoration: cancelado ? 'line-through' : 'none',
              }}
            >
              {nomeCurto(s.inspector?.name)}
            </span>
            {s.inspector_left && !cancelado && (
              <UserX size={11} style={{ flexShrink: 0, color: T.mute }} />
            )}
          </span>
        );
      })}
      {resto > 0 && (
        <span style={{ fontSize: 11, lineHeight: '15px', fontWeight: W.strong, color: selecionado ? T.onAccent : T.mute, paddingLeft: 4, ...NUM }}>
          +{resto}
        </span>
      )}
    </span>
  );
}

/**
 * `tituloRef` vai no `<h2>`, que é `tabIndex -1`: quando o painel troca de
 * assunto, o foco vem para cá em vez de cair no `<body>` junto com o botão
 * que sumiu (ver `AgendaPredio`).
 */
function CabecalhoDoPainel({ titulo, subtitulo, onVoltar, acoes, tituloRef, tituloId }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: onVoltar ? '12px 12px 8px 8px' : '12px 12px 8px 16px', flexShrink: 0 }}>
      {onVoltar && (
        <button type="button" className="icone-btn icone-btn--compacto" aria-label="Voltar para a lista" onClick={onVoltar}>
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 ref={tituloRef} id={tituloId} tabIndex={-1} style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text, margin: 0 }}>{titulo}</h2>
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
        <li key={s.id} data-schedule-id={s.id}>
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
  // Clique num dia passado com o formulário de novo agendamento aberto: a data
  // não muda, e o campo diz por quê.
  const [erroData, setErroData] = useState(null);
  /**
   * O painel da direita escondido (o calendário toma a largura toda) e, com
   * ele escondido, o painel flutuante por cima do calendário. Só da sessão,
   * em memória: voltar à página traz o layout de duas colunas.
   * `transicao` é a animação de coluna em curso: 'recolher', 'abrir' (do
   * escondido, pelo botão do calendário) ou 'fixar' (do flutuante).
   */
  const [escondido, setEscondido] = useState(false);
  const [flutuante, setFlutuante] = useState(false);
  const [transicao, setTransicao] = useState(null);
  // A entrada `anim-fade-up` do painel fica retida (fill `both`) e venceria o
  // opacity/transform do recolher; sai na primeira alternância.
  const [alternado, setAlternado] = useState(false);
  const reduzirMovimento = useMediaQuery(REDUZIR);
  // O formulário aberto difere do que tinha ao abrir; e a saída que espera o
  // "Descartar" da confirmação.
  const [formSujo, setFormSujo] = useState(false);
  const [saidaPendente, setSaidaPendente] = useState(null);
  // O mesmo "sujo" vai para o registro global: o menu lateral, os links e o
  // F5 também perguntam antes de levar a pessoa embora (ver `UnsavedGuard`).
  // As saídas de dentro do painel são botões, não links, e seguem com a
  // confirmação daqui — a guarda global só escuta `<a>` e o `beforeunload`.
  useUnsavedFlag(formSujo && (painel.modo === 'novo' || painel.modo === 'editar'));
  const [, setRefoco] = useState(0);
  const painelId = useId();
  const tituloId = useId();

  const podeEscrever = canEdit && !frozen;

  const { data, isLoading, isError, refetch, isFetching } = useBuildingSchedules(buildingId, { month, year });
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
    // Prazo vencido conta em "Atrasadas" e concluída com atraso em "Concluídas":
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

  /**
   * O foco quando o painel troca de assunto.
   *
   * O botão que disparou a troca (o lápis da linha, a seta de voltar, o
   * "Salvar") some junto com o conteúdo antigo, e o foco cairia no `<body>`:
   * quem usa teclado voltaria ao topo da página. Então, depois da troca, o
   * foco vai ao título do painel novo; e, ao voltar para a lista, à linha (ou
   * ao dia do calendário) de onde a pessoa saiu, se ela ainda existir.
   *
   * O clique num dia não pede foco: o calendário continua na tela, e o foco
   * fica no dia — tirá-lo de lá quebraria a navegação pelas setas.
   */
  const raizRef = useRef(null);
  const tituloRef = useRef(null);
  const origemRef = useRef(null);
  const focoRef = useRef(null);
  const asideRef = useRef(null);
  const botaoMostrarRef = useRef(null);
  const botaoEsconderRef = useRef(null);
  // De onde o painel flutuante foi aberto — para onde o foco volta ao fechar.
  const origemFlutuanteRef = useRef(null);
  // Quem tinha o foco quando a confirmação de descartar abriu.
  const focoAntesDaPerguntaRef = useRef(null);

  function focarOrigem() {
    const o = origemRef.current;
    origemRef.current = null;
    return focarAlvo(o);
  }

  function focarAlvo(o) {
    const raiz = raizRef.current;
    if (!o || !raiz) return false;
    let el = null;
    if (o.tipo === 'linha') el = raiz.querySelector(`[data-schedule-id="${o.id}"] button`);
    else if (o.tipo === 'dia') el = raiz.querySelector(`[data-date="${o.date}"]`);
    else if (o.tipo === 'el' && o.el?.isConnected) el = o.el;
    if (!el) return false;
    el.focus();
    return true;
  }

  useEffect(() => {
    const pedido = focoRef.current;
    if (!pedido) return undefined;
    // Uma caixa modal saindo (a confirmação de descartar) ainda deixa o resto
    // da página inerte, e o foco dado agora se perderia: espera ela sair.
    if (document.querySelector('dialog[open]')) {
      const t = setTimeout(() => setRefoco((n) => n + 1), MODAL_EXIT_MS + 20);
      return () => clearTimeout(t);
    }
    focoRef.current = null;
    if (typeof pedido === 'object') {
      if (!focarAlvo(pedido)) tituloRef.current?.focus();
      return undefined;
    }
    if (pedido === 'origem' && focarOrigem()) return undefined;
    if (pedido === 'mostrar' || pedido === 'esconder') {
      (pedido === 'mostrar' ? botaoMostrarRef : botaoEsconderRef).current?.focus();
      return undefined;
    }
    if (pedido === 'flutuante-origem') {
      const o = origemFlutuanteRef.current;
      origemFlutuanteRef.current = null;
      if (!focarAlvo(o)) botaoMostrarRef.current?.focus();
      return undefined;
    }
    tituloRef.current?.focus();
    return undefined;
  });

  /**
   * Toda saída que desmonta o formulário passa por aqui: com alteração não
   * salva, a ação espera o "Descartar" da confirmação; sem, vai direto.
   * Salvar não passa — `concluirFormulario` sai sem perguntar.
   */
  function guardarSaida(acao) {
    const comFormulario = painel.modo === 'novo' || painel.modo === 'editar';
    if (!comFormulario || !formSujo) {
      acao();
      return;
    }
    const ativo = document.activeElement;
    focoAntesDaPerguntaRef.current = ativo && ativo !== document.body ? ativo : null;
    // A função vai dentro de um atualizador, senão o React a executaria.
    setSaidaPendente(() => acao);
  }

  function descartar() {
    const acao = saidaPendente;
    setSaidaPendente(null);
    focoAntesDaPerguntaRef.current = null;
    // Descartado, não há mais o que perder: a flag global cai junto com a
    // ação, e nada pergunta uma segunda vez.
    setFormSujo(false);
    acao?.();
  }

  /** "Continuar editando": o foco volta a quem pediu a saída. */
  function continuarEditando() {
    setSaidaPendente(null);
    const el = focoAntesDaPerguntaRef.current;
    focoAntesDaPerguntaRef.current = null;
    focoRef.current = el ? { tipo: 'el', el } : 'titulo';
  }

  /** De onde a pessoa saiu da lista — para onde o foco volta. */
  function marcarOrigem(origem) {
    if (painel.modo === 'lista' || !origemRef.current) origemRef.current = origem;
  }

  function irPara(dateKey) {
    const d = parseDateKey(dateKey);
    if (!d) return;
    if (d.getMonth() + 1 !== month || d.getFullYear() !== year) {
      setMonth(d.getMonth() + 1);
      setYear(d.getFullYear());
    }
  }

  function voltarParaLista() {
    if (painel.modo !== 'lista') focoRef.current = 'origem';
    setErroData(null);
    setDirecao('voltar');
    setPainel({ modo: 'lista' });
  }

  function abrirNovo(dateKey, { focar = true } = {}) {
    if (focar) {
      abrirFlutuante(focoAtual());
      marcarOrigem(focoAtual());
      focoRef.current = 'titulo';
    }
    setErroData(null);
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
    // Outro agendamento troca o formulário, e a edição em curso se perderia;
    // o mesmo que já está aberto não remonta nada.
    if (painel.modo === 'editar' && painel.schedule.id === schedule.id) abrirEdicaoJa(schedule);
    else guardarSaida(() => abrirEdicaoJa(schedule));
  }

  function abrirEdicaoJa(schedule) {
    abrirFlutuante(focoAtual());
    marcarOrigem({ tipo: 'linha', id: schedule.id });
    focoRef.current = 'titulo';
    setErroData(null);
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
   * agendamentos que ele já tem listados por cima. Com o formulário aberto
   * (novo ou edição), só a data troca — a edição em curso não se perde. Dia
   * passado com o formulário de novo agendamento aberto também não o fecha: a
   * data fica, e o campo diz que ela não pode estar no passado. Na edição, a
   * data passada vale (o formulário aceita, como o servidor). Fora do
   * formulário, dia passado (ou sem permissão) não recebe agendamento novo: o
   * painel mostra o que houve nele.
   */
  function escolherDia(key) {
    // Painel escondido: o dia abre o flutuante, e não a coluna.
    abrirFlutuante({ tipo: 'dia', date: key });
    if (podeEscrever && painel.modo === 'editar') {
      mudarData(key);
      return;
    }
    if (podeEscrever && painel.modo === 'novo' && key < hoje) {
      setErroData('A data não pode estar no passado');
      return;
    }
    if (!podeEscrever || key < hoje) {
      if (painel.modo === 'dia' && painel.date === key) {
        if (flutuante) fecharFlutuante();
        else voltarParaLista();
        return;
      }
      origemRef.current = { tipo: 'dia', date: key };
      setDirecao('ir');
      setPainel({ modo: 'dia', date: key });
      return;
    }
    if (painel.modo === 'novo') {
      mudarData(key);
      return;
    }
    origemRef.current = { tipo: 'dia', date: key };
    abrirNovo(key, { focar: false });
  }

  function mudarData(key) {
    setErroData(null);
    setPainel((p) => ({ ...p, date: key }));
    irPara(key);
  }

  /** O elemento com foco agora, como origem para devolver o foco depois. */
  function focoAtual() {
    const ativo = typeof document !== 'undefined' ? document.activeElement : null;
    return ativo && ativo !== document.body ? { tipo: 'el', el: ativo } : null;
  }

  /**
   * Com o painel escondido, o que o abriria abre o flutuante. A primeira
   * abertura leva o foco ao título (é um diálogo que acabou de aparecer); com
   * ele já aberto, clicar noutro dia só troca a data, e o foco fica no dia.
   */
  function abrirFlutuante(origem) {
    if (!escondido || flutuante) return;
    origemFlutuanteRef.current = origem;
    focoRef.current = 'titulo';
    medirRecorte();
    setFlutuante(true);
  }

  /** X, Esc, clique fora, fim do formulário: volta ao escondido. */
  function fecharFlutuante() {
    setFlutuante(false);
    setErroData(null);
    setDirecao('voltar');
    setPainel({ modo: 'lista' });
    origemRef.current = null;
    focoRef.current = 'flutuante-origem';
  }

  function animarColuna(tipo) {
    setAlternado(true);
    if (!reduzirMovimento) setTransicao(tipo);
  }

  /**
   * Esconder volta o painel à lista: com ele escondido, o dia aceso no
   * calendário não teria a que corresponder. O foco vai ao botão que o traz
   * de volta, no cabeçalho do calendário — o que foi clicado sumiu.
   */
  function esconderPainel() {
    animarColuna('recolher');
    setEscondido(true);
    setFlutuante(false);
    setErroData(null);
    setPainel({ modo: 'lista' });
    origemRef.current = null;
    focoRef.current = 'mostrar';
  }

  /** Mostrar (do escondido) ou fixar (do flutuante, com o conteúdo como está). */
  function mostrarPainel() {
    // Do flutuante o painel já está no lugar: só o calendário encolhe.
    animarColuna(flutuante ? 'fixar' : 'abrir');
    setEscondido(false);
    setFlutuante(false);
    origemFlutuanteRef.current = null;
    focoRef.current = 'esconder';
  }

  /** Salvou, concluiu, cancelou ou deu 409: sai sem perguntar, e sem flag. */
  function concluirFormulario() {
    setFormSujo(false);
    if (flutuante) fecharFlutuante();
    else voltarParaLista();
  }

  /**
   * A proporção das colunas, pela Web Animations API, como as outras
   * animações do arquivo: keyframes explícitos em px (o `clamp(300px, 28vw,
   * 380px)` resolvido na hora) interpolam sempre do mesmo jeito, sem depender
   * de o navegador saber interpolar `clamp()` com `vw` contra `0px`, e não
   * deixam `transition` pendurada no estilo para o redimensionar da janela.
   */
  const gradeRef = useRef(null);
  const escondidoAntes = useRef(escondido);
  useLayoutEffect(() => {
    if (escondidoAntes.current === escondido) return;
    escondidoAntes.current = escondido;
    const el = gradeRef.current;
    if (!transicao || !el || typeof el.animate !== 'function') return;
    const largura = Math.min(380, Math.max(300, window.innerWidth * 0.28));
    const aberto = { gridTemplateColumns: `minmax(0px, 1fr) ${largura}px`, columnGap: '20px' };
    const fechado = { gridTemplateColumns: 'minmax(0px, 1fr) 0px', columnGap: '0px' };
    el.animate(escondido ? [aberto, fechado] : [fechado, aberto], { duration: DURACAO_COLUNA, easing: EASE_GAVETA });
  }, [escondido, transicao]);

  /**
   * O recorte do flutuante: do topo da grade de dias ao fim dela, medido em
   * relação à caixa das colunas. Medido no clique que abre o flutuante (para
   * ele já nascer no lugar) e, enquanto o painel está escondido, por um
   * ResizeObserver — que acompanha a troca entre meses de 5 e 6 semanas e o
   * redimensionar da janela.
   */
  const [recorte, setRecorte] = useState({ top: 0, bottom: 0 });
  function medirRecorte() {
    const caixa = gradeRef.current;
    const grade = caixa?.querySelector('[role="grid"]');
    if (!grade) return;
    const c = caixa.getBoundingClientRect();
    const g = grade.getBoundingClientRect();
    const novo = { top: Math.round(g.top - c.top), bottom: Math.round(c.bottom - g.bottom) };
    setRecorte((r) => (r.top === novo.top && r.bottom === novo.bottom ? r : novo));
  }
  const aoRedimensionar = useEffectEvent(medirRecorte);
  useEffect(() => {
    const caixa = gradeRef.current;
    const grade = caixa?.querySelector('[role="grid"]');
    if (!escondido || !grade || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => aoRedimensionar());
    ro.observe(caixa);
    ro.observe(grade);
    return () => ro.disconnect();
  }, [escondido]);

  useEffect(() => {
    if (!transicao) return undefined;
    const t = setTimeout(() => setTransicao(null), DURACAO_COLUNA + 40);
    return () => clearTimeout(t);
  }, [transicao]);

  /**
   * O flutuante é um diálogo não modal: o calendário atrás continua vivo
   * (trocar o dia muda a data do formulário), então nada de prender o foco.
   * Esc fecha — a menos que uma caixa modal (detalhes, confirmação) esteja
   * por cima, e aí é ela que fecha. Clique fora fecha só em área sem
   * controle: dia e setas do mês seguem mandando no painel.
   */
  const aoFecharFlutuante = useEffectEvent(() => guardarSaida(fecharFlutuante));
  useEffect(() => {
    if (!flutuante) return undefined;
    function noTeclado(e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      aoFecharFlutuante();
    }
    function noPonteiro(e) {
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      if (asideRef.current?.contains(alvo) || !raizRef.current?.contains(alvo)) return;
      // Dentro de uma caixa modal (detalhes, confirmação) não é "fora".
      if (alvo.closest('dialog')) return;
      if (alvo.closest('button, a, input, select, textarea, label, [role="button"]')) return;
      aoFecharFlutuante();
    }
    document.addEventListener('keydown', noTeclado);
    document.addEventListener('pointerdown', noPonteiro);
    return () => {
      document.removeEventListener('keydown', noTeclado);
      document.removeEventListener('pointerdown', noPonteiro);
    };
  }, [flutuante]);

  const selecionado = painel.modo === 'lista' ? null : painel.date;
  const doDia = selecionado ? ordenarPorData(porDia[selecionado] ?? []) : [];
  const nomeDoMes = formatMesAno(month, year);
  const atrasados = contagens.atrasado;

  // No cabeçalho do painel: fixo, o botão de esconder; flutuante, fixar e fechar.
  const acoesDoPainel = flutuante ? (
    <>
      <button
        type="button"
        className="icone-btn icone-btn--compacto"
        aria-label="Fixar painel ao lado do calendário"
        title="Fixar painel"
        aria-controls={painelId}
        onClick={mostrarPainel}
      >
        <Pin size={16} aria-hidden="true" />
      </button>
      <button type="button" className="icone-btn icone-btn--compacto" aria-label="Fechar painel" title="Fechar" onClick={() => guardarSaida(fecharFlutuante)}>
        <X size={17} aria-hidden="true" />
      </button>
    </>
  ) : (
    <button
      ref={botaoEsconderRef}
      type="button"
      className="icone-btn icone-btn--compacto"
      aria-label="Esconder painel"
      title="Esconder painel"
      aria-expanded={!escondido}
      aria-controls={painelId}
      onClick={() => guardarSaida(esconderPainel)}
    >
      <PanelRightClose size={17} aria-hidden="true" />
    </button>
  );

  let conteudo;
  if (painel.modo === 'lista') {
    conteudo = (
      <>
        <CabecalhoDoPainel
          titulo="Agendamentos do mês"
          subtitulo={nomeDoMes}
          tituloRef={tituloRef}
          tituloId={tituloId}
          acoes={acoesDoPainel}
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
                {filtro === 'todos' ? 'Nenhuma vistoria agendada neste mês' : `Nenhuma vistoria ${SCHEDULE_STATES[filtro].label.toLowerCase()} neste mês`}
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
          tituloRef={tituloRef}
          tituloId={tituloId}
          acoes={acoesDoPainel}
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
          onVoltar={() => guardarSaida(voltarParaLista)}
          tituloRef={tituloRef}
          tituloId={tituloId}
          acoes={acoesDoPainel}
        />
        <FormularioAgendamento
          key={editando ? `e:${painel.schedule.id}` : `n:${rodada}`}
          buildingId={buildingId}
          schedule={editando ? painel.schedule : null}
          date={painel.date}
          onDateChange={mudarData}
          onDone={concluirFormulario}
          onDirtyChange={setFormSujo}
          disabled={!podeEscrever}
          erroData={editando ? undefined : erroData}
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

  /**
   * Onde o painel está. Na grade enquanto a coluna existe — e enquanto ela
   * recolhe, como cortina. Posicionado por cima do calendário quando está
   * escondido (invisível ou flutuante) e enquanto é fixado a partir do
   * flutuante: ali ele já está no lugar final, e só o calendário encolhe.
   */
  const naGrade = (!escondido && transicao !== 'fixar') || transicao === 'recolher';
  const oculto = escondido && !flutuante;
  const tempoAside = oculto ? 200 : 260; // a saída é mais curta que a entrada
  const estiloAside = {
    background: T.card, borderRadius: R.card, overflow: 'hidden',
    boxShadow: flutuante ? T.elev2 : T.cardRing,
    opacity: oculto ? 0 : 1,
    // Com "reduzir movimento", o flutuante só esmaece.
    transform: oculto && !reduzirMovimento ? 'translateX(24px)' : 'translateX(0)',
    visibility: oculto && !transicao ? 'hidden' : 'visible',
    pointerEvents: oculto ? 'none' : undefined,
    transition: [
      `opacity ${tempoAside}ms ${EASE_GAVETA}`, `transform ${tempoAside}ms ${EASE_GAVETA}`, `box-shadow ${tempoAside}ms ease`,
      `top ${DURACAO_COLUNA}ms ${EASE_GAVETA}`, `bottom ${DURACAO_COLUNA}ms ${EASE_GAVETA}`,
      `visibility 0s linear ${oculto ? tempoAside : 0}ms`,
    ].join(', '),
    ...(naGrade
      ? { position: 'relative', minHeight: 560, gridColumn: 2, gridRow: 1 }
      : {
          position: 'absolute', right: 0, width: LARGURA_PAINEL, maxWidth: '100%', zIndex: 3,
          // Flutuante, começa abaixo do cabeçalho do calendário (resumo,
          // "Agendar", "Mostrar painel" e as setas do mês seguem à mão) e vai
          // até o fim da grade. Ao fixar, cresce até a altura da coluna.
          top: transicao === 'fixar' ? 0 : recorte.top,
          bottom: transicao === 'fixar' ? 0 : recorte.bottom,
        }),
  };

  return (
    <div ref={raizRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 32px 32px', display: 'flex', flexDirection: 'column' }}>
      {/* Ocupa a altura que sobra na janela: o calendário inteiro à vista, sem
          rolar. Abaixo do mínimo legível das semanas, aí sim a página rola. */}
      <div
        style={{
          position: 'relative',
          flex: '1 0 auto',
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) ${escondido ? '0px' : LARGURA_PAINEL}`,
          columnGap: escondido ? 0 : 20,
          alignItems: 'stretch',
        }}
        ref={gradeRef}
      >
        {/* Calendário */}
        <section
          aria-label="Calendário da agenda"
          className="anim-fade-up"
          style={{
            background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, minWidth: 0,
            gridColumn: 1, gridRow: 1, display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: T.mute, margin: 0, ...NUM }} aria-live="polite">
              {isLoading ? 'Carregando agenda…' : isError ? 'Não foi possível carregar a agenda' : (
                <>
                  {contagens.todos} agendamento{contagens.todos !== 1 ? 's' : ''} em {nomeDoMes.toLowerCase()}
                  {atrasados > 0 && (
                    <span style={{ color: T.text, fontWeight: W.strong }}> · {atrasados} atrasada{atrasados !== 1 ? 's' : ''}</span>
                  )}
                  {isFetching && !isLoading && <span className="so-leitor"> (atualizando)</span>}
                </>
              )}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {escondido && (
                <button
                  ref={botaoMostrarRef}
                  type="button"
                  className="icone-btn icone-btn--compacto icone-btn--chip"
                  aria-label="Mostrar painel"
                  title="Mostrar painel"
                  aria-expanded={false}
                  aria-controls={painelId}
                  onClick={mostrarPainel}
                >
                  <PanelRightOpen size={17} aria-hidden="true" />
                </button>
              )}
              {canEdit && (
                <Button
                  onClick={() => guardarSaida(() => abrirNovo(hoje))}
                  disabled={frozen}
                  title={frozen ? 'Prédio inativo: a agenda está só para leitura' : undefined}
                  style={{ padding: '10px 16px', flexShrink: 0 }}
                >
                  <Plus size={16} aria-hidden="true" /> Agendar
                </Button>
              )}
            </div>
          </div>

          <CalendarioMensal
            size="large"
            month={month}
            year={year}
            onMonthChange={(m, y) => { setMonth(m); setYear(y); }}
            selectedDate={selecionado}
            onSelectDate={escolherDia}
            marks={porDia}
            renderDayContent={(key, marks) => <ChipsDoDia marks={marks} selecionado={key === selecionado} />}
            label="Agenda de vistorias do prédio"
            semResumo={!!transicao}
          />
        </section>

        {/* Painel da direita: lista do mês, dia, ou formulário */}
        {/* Um elemento só nos três estados (coluna, escondido, flutuante): o
            conteúdo é o mesmo, e o formulário em curso não remonta ao fixar.
            Flutuante, é diálogo não modal — o calendário atrás segue vivo. */}
        <div
          ref={asideRef}
          id={painelId}
          role={flutuante ? 'dialog' : 'complementary'}
          aria-label={flutuante ? undefined : 'Agendamentos'}
          aria-labelledby={flutuante ? tituloId : undefined}
          className={alternado ? undefined : 'anim-fade-up anim-d1'}
          style={estiloAside}
        >
          {/* Preso à direita com a largura final: na cortina, a coluna
              estreita recorta o conteúdo em vez de espremê-lo. */}
          <div
            ref={painelRef}
            style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '100%', minWidth: LARGURA_PAINEL, display: 'flex', flexDirection: 'column' }}
          >
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
        </div>
      </div>

      <ScheduleDetailsModal
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        schedules={detalhe ? [detalhe] : []}
        showBuilding={false}
        onEdit={podeEscrever ? abrirEdicao : undefined}
      />

      <UnsavedChangesModal open={!!saidaPendente} onConfirm={descartar} onCancel={continuarEditando} />
    </div>
  );
}
