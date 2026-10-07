/**
 * Vocabulário da agenda de vistorias — datas, status e textos.
 *
 * Mora fora dos componentes porque o mesmo agendamento aparece em quatro
 * peças (calendário, item de lista, caixa de detalhes, sino), e cada uma com
 * sua própria regra de "atrasado" ou seu próprio "até dd/MM" acabaria
 * discordando da vizinha na mesma tela.
 */
import { format, formatDistanceToNowStrict, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseReportDate } from '@/app/lib/date';
import { T } from '@/app/lib/theme';

/** `yyyy-MM-dd` de uma data local — a chave de dia de toda a agenda. */
export function toDateKey(date) {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Lê `yyyy-MM-dd` (ou ISO com hora) como dia local.
 *
 * `scheduled_date` e `due_date` são colunas DATE: com `new Date(...)` direto,
 * a meia-noite UTC vira o dia anterior no fuso do Brasil. Ver `parseReportDate`.
 */
export function parseDateKey(value) {
  return parseReportDate(value);
}

/** A chave de dia de um valor vindo da API, já sem a hora. */
export function dateKeyOf(value) {
  if (!value) return null;
  if (value instanceof Date) return toDateKey(value);
  return String(value).slice(0, 10);
}

/** "terça-feira, 7 de outubro de 2026". */
export function formatDiaExtenso(value) {
  const d = parseDateKey(value);
  return d ? format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '';
}

/** "7 de outubro" — título de caixa, onde o ano é óbvio. */
export function formatDiaMes(value) {
  const d = parseDateKey(value);
  return d ? format(d, "d 'de' MMMM", { locale: ptBR }) : '';
}

/** "ter., 7 out." — linha de detalhe, curta. */
export function formatDiaCurto(value) {
  const d = parseDateKey(value);
  return d ? format(d, "EEE, d MMM", { locale: ptBR }) : '';
}

/** "07/10". */
export function formatDataCurta(value) {
  const d = parseDateKey(value);
  return d ? format(d, 'dd/MM') : '';
}

/** "até 12/10". */
export function formatAte(value) {
  const curta = formatDataCurta(value);
  return curta ? `até ${curta}` : '';
}

/** "Outubro 2026" — o cabeçalho do calendário. */
export function formatMesAno(month, year) {
  const s = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "há 5 minutos", "há 2 dias". */
export function formatHaQuanto(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `há ${formatDistanceToNowStrict(d, { locale: ptBR })}`;
}

export function isHoje(value) {
  const d = parseDateKey(value);
  return !!d && isSameDay(d, new Date());
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * O estado que a tela mostra, que não é só o `status` do banco.
 *
 * Nenhum dos estados de atraso é gravado: o backend manda calculado.
 * - `overdue`: PENDENTE com o DIA AGENDADO já passado → "Atrasado". O inspetor
 *   ainda pode (e deve) fazer a vistoria.
 * - `past_deadline`: PENDENTE com o "até quando" (`due_date`) também passado →
 *   "Prazo vencido", o limite final estourado. Vence o `overdue` quando os dois
 *   vêm ligados.
 * - `completed_late`: CONCLUIDO depois do dia agendado → "Concluído com atraso".
 */
export function scheduleState(schedule) {
  const status = schedule?.status ?? 'PENDENTE';
  if (status === 'CONCLUIDO') return schedule?.completed_late ? 'concluido_atraso' : 'concluido';
  if (status === 'CANCELADO') return 'cancelado';
  if (schedule?.past_deadline) return 'prazo_vencido';
  return schedule?.overdue ? 'atrasado' : 'pendente';
}

/**
 * Rótulo, cor e variante de `Badge` de cada estado.
 *
 * `color` é para letra e bolinha, por isso o dourado vai como `accentInk` (o
 * que passa em contraste no claro) e não `accent`. Verde e vermelho são os do
 * tema — no claro eles escurecem sozinhos (ver app/globals.css).
 *
 * O tema não tem cor de aviso própria: a `Badge` "warning" é o dourado tingido.
 * Então pendente e atrasado dividem a matiz e se separam pela forma — o
 * pendente é marca VAZADA (contorno, "ainda vai acontecer") e etiqueta neutra;
 * o atrasado é marca CHEIA e etiqueta dourada tingida. Prazo vencido sobe para
 * o vermelho, que no produto é reservado para "passou do limite".
 *
 * "Concluído com atraso" fica no verde do concluído — foi feito, e é isso que
 * a cor diz; o atraso vai no rótulo, sem uma cor nova disputando atenção.
 *
 * `filtro` é o recorte da lista do mês em que o estado cai: prazo vencido
 * também é atrasado, e concluído com atraso também é concluído.
 */
export const SCHEDULE_STATES = {
  prazo_vencido: { label: 'Prazo vencido', color: T.danger, badge: 'danger', order: 0, filtro: 'atrasado' },
  atrasado: { label: 'Atrasado', color: T.accentInk, badge: 'warning', order: 1, filtro: 'atrasado' },
  pendente: { label: 'Pendente', color: T.accentInk, badge: 'default', order: 2, filtro: 'pendente', vazado: true },
  concluido_atraso: { label: 'Concluído com atraso', color: T.success, badge: 'success', order: 3, filtro: 'concluido' },
  concluido: { label: 'Concluído', color: T.success, badge: 'success', order: 3, filtro: 'concluido' },
  cancelado: { label: 'Cancelado', color: T.faint, badge: 'default', order: 4, filtro: 'cancelado' },
};

export function scheduleStateMeta(schedule) {
  return SCHEDULE_STATES[scheduleState(schedule)];
}

/** PENDENTE que já passou do dia agendado — atrasado ou com prazo vencido. */
export function isAtrasado(schedule) {
  const s = scheduleState(schedule);
  return s === 'atrasado' || s === 'prazo_vencido';
}

/**
 * O preenchimento de uma marca de estado (bolinha, fio da linha, chip).
 *
 * `cor` troca a cor (o calendário pinta tudo de preto sobre o dia escolhido);
 * `espessura` é o contorno da marca vazada. O contorno vai em `boxShadow`
 * interno, e não em `border`, para a marca ter o mesmo tamanho cheia ou vazada.
 */
export function estiloMarca(estado, { cor, espessura = 1.5 } = {}) {
  const meta = SCHEDULE_STATES[estado] ?? SCHEDULE_STATES.pendente;
  const c = cor ?? meta.color;
  return meta.vazado
    ? { background: 'transparent', boxShadow: `inset 0 0 0 ${espessura}px ${c}` }
    : { background: c };
}

/**
 * O mais urgente primeiro: prazo vencido, atrasado, pendente, concluído,
 * cancelado. Estável — no mesmo estado, a ordem de quem chamou fica.
 */
export function sortByUrgency(list) {
  return [...list].sort(
    (a, b) => SCHEDULE_STATES[scheduleState(a)].order - SCHEDULE_STATES[scheduleState(b)].order
  );
}

/**
 * "3 vistorias atrasadas", "1 com prazo vencido" — a contagem do alerta.
 * Devolve `{ total, prazoVencido }` e as duas frases prontas.
 */
export function resumoAtrasos(schedules = []) {
  const atrasados = schedules.filter(isAtrasado);
  const total = atrasados.length;
  const prazoVencido = atrasados.filter((s) => scheduleState(s) === 'prazo_vencido').length;
  return {
    total,
    prazoVencido,
    titulo: total === 1 ? '1 vistoria atrasada' : `${total} vistorias atrasadas`,
    detalhe: prazoVencido > 0 ? `${prazoVencido} com prazo vencido` : '',
  };
}

// ── Agrupamento ───────────────────────────────────────────────────────────────

/**
 * Agendamentos agrupados pelo dia marcado: `{ 'yyyy-MM-dd': Schedule[] }`.
 *
 * Serve direto como `marks` do `CalendarioMensal` (ele só lê `status` e
 * `overdue` de cada item) e como lista do dia para a `ScheduleDetailsModal`.
 * `field` troca a data que agrupa — `due_date` para uma visão de prazos.
 */
export function groupSchedulesByDay(schedules = [], field = 'scheduled_date') {
  const out = {};
  for (const s of schedules) {
    const key = dateKeyOf(s?.[field]);
    if (!key) continue;
    (out[key] ??= []).push(s);
  }
  return out;
}

/** Alias com o nome que o calendário usa. */
export const schedulesToMarks = groupSchedulesByDay;

// ── Textos ────────────────────────────────────────────────────────────────────

/** ["A", "B", "C"] → "A, B e C". */
export function formatLista(items = []) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

/** Aceita `[{label}]` ou `['3º andar']` — o payload da notificação traz um ou outro. */
function floorLabels(floors = []) {
  return (floors ?? []).map((f) => (typeof f === 'string' ? f : f?.label)).filter(Boolean);
}

/**
 * Os andares em uma linha: "3º Andar, 4º Andar +2".
 *
 * `max` é quantos nomes aparecem antes do "+N" — a linha da lista lateral é
 * estreita, e uma vistoria de doze andares não pode empurrar o status para fora.
 */
export function resumoAndares(floors = [], max = 2) {
  const labels = floorLabels(floors);
  if (labels.length === 0) return '';
  const shown = labels.slice(0, max).join(', ');
  const rest = labels.length - max;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/** Os andares em frase: "3º Andar e 4º Andar". */
export function andaresPorExtenso(floors = []) {
  return formatLista(floorLabels(floors));
}

const NOTIFICATION_TITLES = {
  SCHEDULE_CREATED: 'Nova vistoria agendada',
  SCHEDULE_UPDATED: 'Agendamento alterado',
  SCHEDULE_CANCELED: 'Vistoria cancelada',
  SCHEDULE_DUE_SOON: 'Prazo da vistoria chegando',
  // O backend não cria mais este aviso — o atraso agora é alerta visual da
  // agenda, não notificação. O título fica para as que já estão no banco não
  // virarem "Atualização" no sino de ninguém.
  SCHEDULE_OVERDUE: 'Vistoria atrasada',
};

/** Tipos de notificação que levam a um agendamento. */
export function isScheduleNotification(n) {
  return !!n && String(n.type ?? '').startsWith('SCHEDULE_');
}

/**
 * O texto de uma notificação, em duas partes: `title` e `body`.
 *
 * "Nova vistoria agendada" / "Prédio X, 3º Andar e 4º Andar, até 12/10".
 * Tipo desconhecido não quebra o sino: vira "Atualização" com o que houver.
 */
export function textoNotificacao(n) {
  const p = n?.payload ?? {};
  const title = NOTIFICATION_TITLES[n?.type] ?? 'Atualização';
  const partes = [p.building_name, andaresPorExtenso(p.floors), formatAte(p.due_date)].filter(Boolean);
  return { title, body: partes.join(', ') };
}

/** Uma frase só, para leitor de tela e testes. */
export function fraseNotificacao(n) {
  const { title, body } = textoNotificacao(n);
  return body ? `${title} — ${body}` : title;
}
