'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';
import { T, R, W, NUM } from '@/app/lib/theme';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';

/**
 * Altura mínima de uma semana no `large`: o número do dia e três chips de
 * 15px. Abaixo disso a tela rola, em vez de cortar o nome do inspetor.
 */
const MIN_SEMANA_LARGE = 96;
import {
  SCHEDULE_STATES,
  estiloMarca,
  formatAte,
  formatDiaCurto,
  formatDiaExtenso,
  formatMesAno,
  isAtrasado,
  resumoAndares,
  scheduleState,
  sortByUrgency,
  toDateKey,
} from '@/app/lib/agenda';

/**
 * Domingo primeiro, como o `CalendarHeatmap` — duas grades com a semana
 * começando em dias diferentes na mesma tela fariam o olho errar a coluna.
 */
export const WEEK_STARTS_ON = 0;
const WEEKDAYS = [
  { short: 'D', medium: 'Dom', long: 'domingo' },
  { short: 'S', medium: 'Seg', long: 'segunda-feira' },
  { short: 'T', medium: 'Ter', long: 'terça-feira' },
  { short: 'Q', medium: 'Qua', long: 'quarta-feira' },
  { short: 'Q', medium: 'Qui', long: 'quinta-feira' },
  { short: 'S', medium: 'Sex', long: 'sexta-feira' },
  { short: 'S', medium: 'Sáb', long: 'sábado' },
];

const MAX_DOTS = 3;

/**
 * "2 agendamentos, 1 atrasada, 1 com prazo vencido" — o que o leitor de tela
 * ouve além da data. A cor e a forma da bolinha não chegam até ele.
 */
function descreverMarcas(marks, marcaSecundaria) {
  if (!marks?.length) return '';
  const n = marks.length;
  const conta = (estado) => marks.filter((m) => scheduleState(m) === estado).length;
  const atrasados = conta('atrasado');
  const vencidos = conta('prazo_vencido');
  const comAtraso = conta('concluido_atraso');
  const partes = [`${n} agendamento${n !== 1 ? 's' : ''}`];
  if (atrasados) partes.push(`${atrasados} atrasada${atrasados !== 1 ? 's' : ''}`);
  if (vencidos) partes.push(`${vencidos} com prazo vencido`);
  if (comAtraso) partes.push(`${comAtraso} concluída${comAtraso !== 1 ? 's' : ''} com atraso`);
  const semInspetor = marks.filter((m) => m.inspector_left && (m.status ?? 'PENDENTE') === 'PENDENTE').length;
  if (semInspetor) partes.push(`${semInspetor} sem inspetor`);
  const deColegas = marcaSecundaria ? marks.filter(marcaSecundaria).length : 0;
  if (deColegas) partes.push(`${deColegas} de colega${deColegas !== 1 ? 's' : ''}`);
  return partes.join(', ');
}

function Dots({ marks, selected, marcaSecundaria }) {
  if (!marks?.length) return null;
  const shown = sortByUrgency(marks).slice(0, MAX_DOTS);
  return (
    <span aria-hidden="true" style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center', height: 6 }}>
      {shown.map((m, i) => {
        // A marca secundária (o agendamento de um colega, na agenda do
        // inspetor) é menor: a forma e a cor já dizem o estado, e o tamanho
        // é o único canal que sobra sem cor nova.
        const lado = marcaSecundaria?.(m) ? 4 : 6;
        return (
        <span
          key={m.id ?? i}
          style={{
            width: lado,
            height: lado,
            borderRadius: '50%',
            // Sobre o dourado do dia escolhido o cinza do pendente some e o
            // verde e o vermelho perdem contraste: ali as bolinhas viram
            // preto — a forma (vazada ou cheia) continua dizendo pendente ou
            // não, e o status inteiro fica no `aria-label` e na lista ao lado.
            ...estiloMarca(scheduleState(m), selected ? { cor: T.onAccent } : undefined),
          }}
        />
        );
      })}
    </span>
  );
}

/** Ponteiro fino com hover de verdade: só aí existe o resumo que segue o cursor. */
const PONTEIRO_FINO = '(hover: hover) and (pointer: fine)';
const MAX_RESUMO = 4;
const ATRASO_ABRIR = 80;
const ATRASO_FECHAR = 60;
const DURACAO_SAIDA = 90;
const AFASTAMENTO = 14;
const MARGEM_JANELA = 8;
const EASE_SAIDA = 'cubic-bezier(0.23, 1, 0.32, 1)';

/** Há uma caixa (modal, overlay) por cima da tela? Aí o resumo não aparece. */
function haSobreposicao() {
  return !!document.querySelector('dialog[open], [aria-modal="true"]');
}

/**
 * O resumo do dia que segue o cursor.
 *
 * Fica fora da grade, num portal no `<body>`, para nenhum `overflow` o cortar.
 * Quem chama fala com ele pela `ref` (`mostrar`, `mover`, `esconder`): o
 * movimento do mouse nunca vira estado — vai para um ref, e um laço de
 * `requestAnimationFrame` escreve o `transform` direto no elemento. Só a
 * troca de dia re-renderiza, e só o cartão.
 *
 * Posição: à direita e um pouco abaixo do ponteiro; perto da borda direita
 * vira para a esquerda, perto da de baixo sobe, e nunca sai da janela. A
 * escala de entrada parte do canto que está junto do cursor.
 */
function ResumoDoDia({ ref, marks, showInspector, reduzirMovimento }) {
  const [chave, setChave] = useState(null);
  const [fase, setFase] = useState('fechado'); // 'fechado' | 'aberto' | 'saindo'
  const caixaRef = useRef(null);
  const corpoRef = useRef(null);
  const alvo = useRef({ x: 0, y: 0 });
  const pos = useRef(null);
  const raf = useRef(0);
  const timer = useRef(0);
  const faseRef = useRef('fechado');
  function mudarFase(f) {
    faseRef.current = f;
    setFase(f);
  }

  function posicionar(imediato) {
    const el = caixaRef.current;
    if (!el) return;
    const { x, y } = alvo.current;
    if (!pos.current || imediato || reduzirMovimento) pos.current = { x, y };
    else {
      pos.current = {
        x: pos.current.x + (x - pos.current.x) * 0.35,
        y: pos.current.y + (y - pos.current.y) * 0.35,
      };
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const esquerda = pos.current.x + AFASTAMENTO + w > vw - MARGEM_JANELA;
    const acima = pos.current.y + AFASTAMENTO + h > vh - MARGEM_JANELA;
    let left = esquerda ? pos.current.x - AFASTAMENTO - w : pos.current.x + AFASTAMENTO;
    let top = acima ? pos.current.y - AFASTAMENTO - h : pos.current.y + AFASTAMENTO;
    left = Math.max(MARGEM_JANELA, Math.min(left, vw - w - MARGEM_JANELA));
    top = Math.max(MARGEM_JANELA, Math.min(top, vh - h - MARGEM_JANELA));
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    if (corpoRef.current) corpoRef.current.style.transformOrigin = `${esquerda ? 'right' : 'left'} ${acima ? 'bottom' : 'top'}`;
  }

  function laco() {
    if (faseRef.current === 'fechado') {
      raf.current = 0;
      return;
    }
    if (haSobreposicao()) {
      fechar();
      raf.current = 0;
      return;
    }
    posicionar(false);
    raf.current = requestAnimationFrame(laco);
  }

  function fechar() {
    clearTimeout(timer.current);
    if (faseRef.current !== 'aberto') {
      mudarFase('fechado');
      setChave(null);
      return;
    }
    mudarFase('saindo');
    const corpo = corpoRef.current;
    if (corpo && typeof corpo.animate === 'function') {
      corpo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_SAIDA, easing: 'ease-out', fill: 'forwards' });
    }
    timer.current = setTimeout(() => {
      mudarFase('fechado');
      setChave(null);
    }, DURACAO_SAIDA);
  }

  useImperativeHandle(ref, () => ({
    mostrar(key, x, y) {
      alvo.current = { x, y };
      clearTimeout(timer.current);
      if (haSobreposicao()) return;
      // Já aberto (ou saindo): troca o conteúdo na hora, sem sumir e voltar.
      if (faseRef.current !== 'fechado') {
        setChave(key);
        if (faseRef.current === 'saindo') {
          corpoRef.current?.getAnimations?.().forEach((a) => a.cancel());
          mudarFase('aberto');
        }
        return;
      }
      timer.current = setTimeout(() => {
        if (haSobreposicao()) return;
        pos.current = null;
        setChave(key);
        mudarFase('aberto');
      }, ATRASO_ABRIR);
    },
    mover(x, y) {
      alvo.current = { x, y };
    },
    esconder() {
      clearTimeout(timer.current);
      timer.current = setTimeout(fechar, ATRASO_FECHAR);
    },
    desligar() {
      clearTimeout(timer.current);
      mudarFase('fechado');
      setChave(null);
    },
  }));

  // Entrada: nasce já no lugar, com esmaecer e escala leve a partir do canto
  // do cursor; com "reduzir movimento", só o esmaecer.
  const aberto = fase === 'aberto';
  const visivel = fase !== 'fechado';
  const entrou = useRef(false);
  useLayoutEffect(() => {
    if (!visivel) {
      entrou.current = false;
      return;
    }
    posicionar(true);
    if (!entrou.current && aberto) {
      entrou.current = true;
      const corpo = corpoRef.current;
      if (corpo && typeof corpo.animate === 'function') {
        corpo.animate(
          reduzirMovimento
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 140, easing: EASE_SAIDA }
        );
      }
    }
    if (!raf.current) raf.current = requestAnimationFrame(laco);
    // `posicionar` e `laco` leem refs; só a abertura e a troca de dia contam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, aberto, chave]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    cancelAnimationFrame(raf.current);
  }, []);

  if (!visivel || !chave) return null;
  const lista = sortByUrgency(marks[chave] ?? []);
  if (lista.length === 0) return null;
  const visiveis = lista.length > MAX_RESUMO ? lista.slice(0, MAX_RESUMO) : lista;
  const resto = lista.length - visiveis.length;

  return createPortal(
    <div
      ref={caixaRef}
      aria-hidden="true"
      data-resumo-do-dia={chave}
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 90, pointerEvents: 'none', willChange: 'transform' }}
    >
      <div
        ref={corpoRef}
        style={{
          width: 296, maxWidth: 'calc(100vw - 16px)', padding: '10px 12px',
          background: T.card, borderRadius: R.card, boxShadow: T.elev1,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: W.strong, color: T.mute, textTransform: 'capitalize' }}>
          {formatDiaCurto(chave)}
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visiveis.map((s, i) => {
            const estado = scheduleState(s);
            const comNome = typeof showInspector === 'function' ? showInspector(s) : showInspector;
            const saiu = !!s.inspector_left && (s.status ?? 'PENDENTE') === 'PENDENTE';
            const andares = resumoAndares(s.floors);
            const titulo = comNome ? s.inspector?.name ?? 'Inspetor' : andares || 'Vistoria';
            // Cancelado: inspetor, andares e datas riscados; o rótulo, sem risco.
            const risco = estado === 'cancelado' ? { textDecoration: 'line-through', textDecorationColor: T.faint } : null;
            const corStatus = estado === 'prazo_vencido' ? T.danger : estado === 'cancelado' ? T.mute : T.text;
            return (
              <li key={s.id ?? i} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                <span style={{ width: 7, height: 7, marginTop: 5, borderRadius: '50%', flexShrink: 0, ...estiloMarca(estado) }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: W.strong, color: risco ? T.mute : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, ...risco }}>
                      {titulo}
                    </span>
                    {saiu && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
                          padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: W.strong,
                          background: T.card, color: T.text, boxShadow: `inset 0 0 0 1px ${T.line}`,
                        }}
                      >
                        <UserX size={11} /> Inspetor saiu
                      </span>
                    )}
                  </span>
                  {comNome && andares && (
                    <span style={{ fontSize: 12, color: T.mute, lineHeight: 1.4, overflowWrap: 'anywhere', ...risco }}>{andares}</span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', marginTop: 1 }}>
                    <span
                      data-status
                      style={{
                        padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: W.strong, lineHeight: '16px',
                        background: T.chip, color: corStatus,
                      }}
                    >
                      {SCHEDULE_STATES[estado].label}
                    </span>
                    {s.due_date && (
                      <span style={{ ...NUM, fontSize: 12, color: T.mute, whiteSpace: 'nowrap', ...risco }}>{formatAte(s.due_date)}</span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {resto > 0 && (
          <p style={{ ...NUM, margin: 0, fontSize: 12, fontWeight: W.strong, color: T.mute }}>+{resto}</p>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Calendário mensal da agenda de vistorias.
 *
 * Grade de 7 colunas (domingo → sábado), cabeçalho "Mês Ano" com ‹ ›, dias de
 * outros meses esmaecidos, hoje com contorno, dia escolhido em dourado, e uma
 * bolinha por agendamento (até 3, o mais urgente primeiro) na cor do status.
 *
 * Props:
 * - `month` (1–12), `year`: o mês exibido — controlado por quem chama.
 * - `onMonthChange(month, year)`: setas, PageUp/PageDown, ou clique num dia de
 *   outro mês.
 * - `selectedDate`: `'yyyy-MM-dd'` ou nulo.
 * - `onSelectDate(dateKey)`: clique/Enter num dia habilitado.
 * - `marks`: `{ 'yyyy-MM-dd': [{ status, overdue, id? }] }` — sai pronto de
 *   `groupSchedulesByDay(schedules)` (lib/agenda).
 * - `size`: `'compact'` (padrão; células ≥44px — a 360px, com o vão de 2px,
 *   só se a grade tiver ao menos 320px; ver a home do inspetor) ou `'large'` (tela do gestor: células altas, conteúdo livre).
 * - `renderDayContent(dateKey, marks)`: só no `large` — o que vai embaixo do
 *   número (ex.: chips com o nome do inspetor). Sem ele, as bolinhas.
 * - `disabledPast`: dias antes de hoje não são escolhíveis.
 * - `minDate`: `'yyyy-MM-dd'` — dias antes dele não são escolhíveis.
 * - `fixedWeeks`: sempre 6 linhas, para a altura não pular entre meses.
 *   Padrão `true` no `compact`; no `large`, `false`: uma linha inteira só com
 *   dias do mês seguinte é altura tirada das semanas que importam. Lá a grade
 *   ocupa a altura de quem a contém (as linhas dividem o espaço, com um
 *   mínimo legível), e a troca entre meses de 5 e 6 semanas anima a altura
 *   das linhas em vez de pular.
 * - `label`: nome acessível da grade (padrão "Calendário de agendamentos").
 * - `getDayHint(dateKey)`: opcional; devolve `{ tint, label }` ou nulo. `tint`
 *   é o fundo do dia (fora do escolhido e de outros meses) — a tela inicial do
 *   inspetor pinta assim os dias em que houve vistoria feita, sem disputar
 *   espaço com as bolinhas dos agendamentos; `label` entra no nome acessível
 *   ("2 vistorias feitas"), já que a cor sozinha não diz nada ao leitor de tela.
 * - `marcaSecundaria(mark)`: opcional; `true` desenha a bolinha menor e conta
 *   "de colega" no nome acessível — a agenda do inspetor mostra o prédio todo,
 *   e os agendamentos dos outros ficam em segundo plano.
 * - `showInspector`: `true` (padrão), `false` ou `(schedule) => bool` — se o
 *   resumo do hover diz o nome do inspetor (o inspetor na própria agenda não
 *   se lê a si mesmo; os colegas, sim).
 * - `semResumo`: desliga o resumo do hover (ex.: durante a animação da coluna).
 *
 * Hover: com ponteiro fino, o dia com agendamento mostra um resumo que segue o
 * cursor (ver `ResumoDoDia`). No toque não existe; o clique segue igual.
 *
 * Teclado: setas andam um dia/uma semana, Home/End vão ao início/fim da
 * semana, PageUp/PageDown trocam de mês. Só um dia por vez entra no Tab
 * (tabindex móvel), como no padrão de grade do WAI-ARIA.
 */
export function CalendarioMensal({
  month,
  year,
  onMonthChange,
  selectedDate = null,
  onSelectDate,
  marks = {},
  size = 'compact',
  renderDayContent,
  disabledPast = false,
  minDate,
  fixedWeeks,
  label = 'Calendário de agendamentos',
  getDayHint,
  marcaSecundaria,
  showInspector = true,
  semResumo = false,
}) {
  const large = size === 'large';
  const semanasFixas = fixedWeeks ?? !large;
  const reduzirMovimento = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ponteiroFino = useMediaQuery(PONTEIRO_FINO);
  const comResumo = ponteiroFino && !semResumo;
  const resumoRef = useRef(null);

  // Animação de proporção (coluna ou troca de mês) por baixo: o cartão sai,
  // em vez de ficar apontando para um dia que está andando.
  useEffect(() => {
    resumoRef.current?.desligar();
  }, [comResumo, month, year]);
  const todayKey = toDateKey(new Date());
  const gridRef = useRef(null);
  // Só depois de uma tecla o foco segue o dia — o clique não deve roubar foco
  // de lugar nenhum, e a primeira montagem também não.
  const focusAfterRender = useRef(false);

  const monthStart = useMemo(() => new Date(year, month - 1, 1), [month, year]);

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthStart), { weekStartsOn: WEEK_STARTS_ON });
    let end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: WEEK_STARTS_ON });
    if (semanasFixas) end = addDays(start, 41);
    const days = eachDayOfInterval({ start, end });
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [monthStart, semanasFixas]);

  const minKey = useMemo(() => {
    const keys = [];
    if (disabledPast) keys.push(todayKey);
    if (minDate) keys.push(String(minDate).slice(0, 10));
    return keys.sort().pop() ?? null;
  }, [disabledPast, minDate, todayKey]);

  const isDisabled = (key) => !!minKey && key < minKey;
  const inMonth = (d) => d.getMonth() === month - 1 && d.getFullYear() === year;

  /**
   * O dia que recebe o Tab: o escolhido, se estiver neste mês; senão hoje, se
   * estiver; senão o dia 1. Guardado em estado para a seta poder andar sem
   * mexer na seleção de quem chama.
   */
  const defaultFocus = useMemo(() => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    if (selectedDate?.startsWith(prefix)) return selectedDate;
    if (todayKey.startsWith(prefix)) return todayKey;
    return `${prefix}-01`;
  }, [month, year, selectedDate, todayKey]);

  // O dia focado vale para o mês em que foi escolhido. Trocou o mês pela seta
  // do cabeçalho, ele volta ao padrão daquele mês; trocou por tecla, a tecla
  // já gravou o dia junto com o mês novo.
  const [focus, setFocus] = useState(null);
  const focusKey =
    focus && focus.month === month && focus.year === year ? focus.key : defaultFocus;

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    gridRef.current?.querySelector(`[data-date="${focusKey}"]`)?.focus();
  }, [focusKey]);

  function moveFocus(day) {
    setFocus({ key: toDateKey(day), month: day.getMonth() + 1, year: day.getFullYear() });
  }

  function changeMonth(delta) {
    const next = addMonths(monthStart, delta);
    onMonthChange?.(next.getMonth() + 1, next.getFullYear());
  }

  function choose(day) {
    const key = toDateKey(day);
    if (isDisabled(key)) return;
    moveFocus(day);
    if (!inMonth(day)) onMonthChange?.(day.getMonth() + 1, day.getFullYear());
    onSelectDate?.(key);
  }

  function onKeyDown(e, day) {
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(day, -1); break;
      case 'ArrowRight': next = addDays(day, 1); break;
      case 'ArrowUp': next = addDays(day, -7); break;
      case 'ArrowDown': next = addDays(day, 7); break;
      case 'Home': next = startOfWeek(day, { weekStartsOn: WEEK_STARTS_ON }); break;
      case 'End': next = endOfWeek(day, { weekStartsOn: WEEK_STARTS_ON }); break;
      case 'PageUp': next = addMonths(day, -1); break;
      case 'PageDown': next = addMonths(day, 1); break;
      default: return;
    }
    e.preventDefault();
    // Home no domingo, End no sábado: o foco já está lá, e a bandeira ficaria
    // armada esperando uma mudança que não vem.
    if (toDateKey(next) === focusKey) return;
    focusAfterRender.current = true;
    moveFocus(next);
    if (!inMonth(next)) onMonthChange?.(next.getMonth() + 1, next.getFullYear());
  }

  const titulo = formatMesAno(month, year);
  const navSize = large ? 40 : 44;

  // No `large`, sempre seis faixas: as semanas do mês dividem a altura (1fr)
  // e as que sobram ficam com 0fr. Mesma quantidade de faixas nos dois lados,
  // então a troca entre meses de 5 e 6 semanas interpola em vez de pular.
  const estiloGrade = large
    ? {
        flex: 1,
        display: 'grid',
        gridTemplateRows: `auto ${Array.from({ length: 6 }, (_, i) => (i < weeks.length ? '1fr' : '0fr')).join(' ')}`,
        rowGap: 6,
        transition: reduzirMovimento ? 'none' : 'grid-template-rows 220ms cubic-bezier(0.32, 0.72, 0, 1)',
      }
    : { display: 'flex', flexDirection: 'column', gap: 2 };

  return (
    <div style={large ? { width: '100%', flex: 1, display: 'flex', flexDirection: 'column' } : { width: '100%' }}>
      {/* Cabeçalho: ‹ Mês Ano › */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: large ? 16 : 10 }}>
        <button
          type="button"
          className="cal-nav"
          onClick={() => changeMonth(-1)}
          aria-label="Mês anterior"
          style={{ width: navSize, height: navSize, borderRadius: R.control, border: 'none', background: T.chip, color: T.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div
          aria-live="polite"
          style={{ fontFamily: T.display, fontSize: large ? 18 : 15, fontWeight: W.title, color: T.text, textAlign: 'center' }}
        >
          {titulo}
        </div>
        <button
          type="button"
          className="cal-nav"
          onClick={() => changeMonth(1)}
          aria-label="Próximo mês"
          style={{ width: navSize, height: navSize, borderRadius: R.control, border: 'none', background: T.chip, color: T.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={`${label}, ${titulo}`} style={estiloGrade}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: large ? 6 : 2 }}>
          {WEEKDAYS.map((d) => (
            <div
              key={d.long}
              role="columnheader"
              aria-label={d.long}
              style={{ textAlign: 'center', fontSize: 12, fontWeight: W.strong, color: T.faint, padding: '2px 0 4px' }}
            >
              {large ? d.medium : d.short}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div
            key={toDateKey(week[0])}
            role="row"
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: large ? 6 : 2,
              ...(large && { minHeight: MIN_SEMANA_LARGE }),
            }}
          >
            {week.map((day) => {
              const key = toDateKey(day);
              const dayMarks = marks[key] ?? [];
              const selected = key === selectedDate;
              const today = key === todayKey;
              const outside = !inMonth(day);
              const disabled = isDisabled(key);
              const hint = getDayHint?.(key) ?? null;

              const partes = [formatDiaExtenso(key)];
              if (today) partes.push('hoje');
              const resumo = descreverMarcas(dayMarks, marcaSecundaria);
              if (resumo) partes.push(resumo);
              else partes.push('sem agendamentos');
              if (hint?.label) partes.push(hint.label);
              if (disabled) partes.push('indisponível');

              const color = selected ? T.onAccent : outside || disabled ? T.faint : T.text;
              const background = selected ? T.accent : outside ? 'transparent' : hint?.tint ?? T.chip;
              const atrasado = dayMarks.some(isAtrasado);
              // Dia com vistoria atrasada: contorno vermelho por dentro (sombra
              // interna, não `border`, para a célula não mudar de tamanho). Vence
              // o fio do escolhido e o contorno de hoje; o esmaecer dos dias de
              // outro mês vale para ele também.
              const ring = atrasado
                ? `inset 0 0 0 2px ${T.danger}`
                : selected
                  ? `inset 0 0 0 1px ${T.accentEdge}`
                  : today
                    ? `inset 0 0 0 1.5px ${T.mute}`
                    : 'none';

              return (
                <div key={key} role="gridcell" aria-selected={selected} style={large ? { minWidth: 0, display: 'flex' } : { minWidth: 0 }}>
                  <button
                    type="button"
                    data-date={key}
                    data-atrasado={atrasado || undefined}
                    className={`cal-dia${selected ? ' is-selecionado' : ''}`}
                    tabIndex={key === focusKey ? 0 : -1}
                    aria-label={partes.join(', ')}
                    aria-current={today ? 'date' : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={() => choose(day)}
                    onKeyDown={(e) => onKeyDown(e, day)}
                    onMouseEnter={
                      comResumo
                        ? (e) => (dayMarks.length
                          ? resumoRef.current?.mostrar(key, e.clientX, e.clientY)
                          : resumoRef.current?.esconder())
                        : undefined
                    }
                    onMouseMove={comResumo ? (e) => resumoRef.current?.mover(e.clientX, e.clientY) : undefined}
                    onMouseLeave={comResumo ? () => resumoRef.current?.esconder() : undefined}
                    style={{
                      width: '100%',
                      ...(large ? { flex: 1, minWidth: 0 } : { aspectRatio: '1', minHeight: 44 }),
                      border: 'none',
                      borderRadius: R.card,
                      background,
                      boxShadow: ring,
                      color,
                      opacity: outside ? 0.55 : disabled ? 0.45 : 1,
                      cursor: disabled ? 'default' : 'pointer',
                      font: 'inherit',
                      padding: large ? '8px 8px 6px' : '6px 0 6px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: large ? 'stretch' : 'center',
                      justifyContent: 'space-between',
                      gap: 4,
                      textAlign: large ? 'left' : 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ ...NUM, fontSize: large ? 14 : 13, fontWeight: selected || today ? W.title : W.body, lineHeight: 1 }}
                    >
                      {day.getDate()}
                    </span>
                    {large && renderDayContent ? (
                      <span style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {renderDayContent(key, dayMarks)}
                      </span>
                    ) : (
                      <Dots marks={dayMarks} selected={selected} marcaSecundaria={marcaSecundaria} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {comResumo && (
        <ResumoDoDia ref={resumoRef} marks={marks} showInspector={showInspector} reduzirMovimento={reduzirMovimento} />
      )}
    </div>
  );
}

/**
 * Legenda das bolinhas — opcional, para ir embaixo do calendário.
 * `states` escolhe quais aparecem (padrão: pendente, atrasado, prazo vencido,
 * concluído). "Concluído com atraso" não entra por padrão: a bolinha é a mesma
 * do concluído, e a diferença está escrita na etiqueta da lista.
 */
export function LegendaAgenda({ states = ['pendente', 'atrasado', 'prazo_vencido', 'concluido'] }) {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', listStyle: 'none', padding: 0, margin: 0 }}>
      {states.map((s) => (
        <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.mute }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, ...estiloMarca(s) }} />
          {SCHEDULE_STATES[s].label}
        </li>
      ))}
      <li style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.mute }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, flexShrink: 0, background: T.chip, boxShadow: `inset 0 0 0 2px ${T.danger}` }} />
        Dia com vistoria atrasada
      </li>
    </ul>
  );
}
