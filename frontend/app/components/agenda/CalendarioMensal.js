'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { T, R, W, NUM } from '@/app/lib/theme';
import {
  SCHEDULE_STATES,
  estiloMarca,
  formatDiaExtenso,
  formatMesAno,
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
 * "2 agendamentos, 1 atrasado, 1 com prazo vencido" — o que o leitor de tela
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
  if (atrasados) partes.push(`${atrasados} atrasado${atrasados !== 1 ? 's' : ''}`);
  if (vencidos) partes.push(`${vencidos} com prazo vencido`);
  if (comAtraso) partes.push(`${comAtraso} concluído${comAtraso !== 1 ? 's' : ''} com atraso`);
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
 * - `fixedWeeks`: sempre 6 linhas (padrão `true`), para a altura não pular
 *   entre meses.
 * - `label`: nome acessível da grade (padrão "Calendário de agendamentos").
 * - `getDayHint(dateKey)`: opcional; devolve `{ tint, label }` ou nulo. `tint`
 *   é o fundo do dia (fora do escolhido e de outros meses) — a tela inicial do
 *   inspetor pinta assim os dias em que houve vistoria feita, sem disputar
 *   espaço com as bolinhas dos agendamentos; `label` entra no nome acessível
 *   ("2 vistorias feitas"), já que a cor sozinha não diz nada ao leitor de tela.
 * - `marcaSecundaria(mark)`: opcional; `true` desenha a bolinha menor e conta
 *   "de colega" no nome acessível — a agenda do inspetor mostra o prédio todo,
 *   e os agendamentos dos outros ficam em segundo plano.
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
  fixedWeeks = true,
  label = 'Calendário de agendamentos',
  getDayHint,
  marcaSecundaria,
}) {
  const large = size === 'large';
  const todayKey = toDateKey(new Date());
  const gridRef = useRef(null);
  // Só depois de uma tecla o foco segue o dia — o clique não deve roubar foco
  // de lugar nenhum, e a primeira montagem também não.
  const focusAfterRender = useRef(false);

  const monthStart = useMemo(() => new Date(year, month - 1, 1), [month, year]);

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthStart), { weekStartsOn: WEEK_STARTS_ON });
    let end = endOfWeek(endOfMonth(monthStart), { weekStartsOn: WEEK_STARTS_ON });
    if (fixedWeeks) end = addDays(start, 41);
    const days = eachDayOfInterval({ start, end });
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [monthStart, fixedWeeks]);

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

  return (
    <div style={{ width: '100%' }}>
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

      <div ref={gridRef} role="grid" aria-label={`${label}, ${titulo}`} style={{ display: 'flex', flexDirection: 'column', gap: large ? 6 : 2 }}>
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
          <div key={toDateKey(week[0])} role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: large ? 6 : 2 }}>
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
              const ring = selected
                ? `inset 0 0 0 1px ${T.accentEdge}`
                : today
                  ? `inset 0 0 0 1.5px ${T.mute}`
                  : 'none';

              return (
                <div key={key} role="gridcell" aria-selected={selected} style={{ minWidth: 0 }}>
                  <button
                    type="button"
                    data-date={key}
                    className={`cal-dia${selected ? ' is-selecionado' : ''}`}
                    tabIndex={key === focusKey ? 0 : -1}
                    aria-label={partes.join(', ')}
                    aria-current={today ? 'date' : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={() => choose(day)}
                    onKeyDown={(e) => onKeyDown(e, day)}
                    style={{
                      width: '100%',
                      ...(large ? { minHeight: 104 } : { aspectRatio: '1', minHeight: 44 }),
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
    </ul>
  );
}
