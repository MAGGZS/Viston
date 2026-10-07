/**
 * A ordem e as contas da mesa do inspetor — fora da página para poderem ser
 * testadas sem montar a tela (e porque `page.js` só pode exportar a página).
 */
import { differenceInCalendarDays } from 'date-fns';
import { SCHEDULE_STATES, dateKeyOf, parseDateKey, scheduleState } from '@/app/lib/agenda';

/**
 * Os agendamentos ainda por fazer, do mais urgente ao menos.
 *
 * Prazo vencido primeiro (passou do limite final), depois atrasado (passou do
 * dia agendado), depois o resto; dentro de cada grupo o prazo mais próximo na
 * frente, e empate de prazo desempata pelo dia marcado. Concluídos e
 * cancelados saem: a lista é do que falta.
 */
export function ordenarProximos(schedules = []) {
  return schedules
    .filter((s) => (s?.status ?? 'PENDENTE') === 'PENDENTE')
    .sort((a, b) => {
      const urgencia = SCHEDULE_STATES[scheduleState(a)].order - SCHEDULE_STATES[scheduleState(b)].order;
      if (urgencia !== 0) return urgencia;
      const prazo = String(dateKeyOf(a.due_date) ?? '').localeCompare(String(dateKeyOf(b.due_date) ?? ''));
      if (prazo !== 0) return prazo;
      return String(dateKeyOf(a.scheduled_date) ?? '').localeCompare(String(dateKeyOf(b.scheduled_date) ?? ''));
    });
}

const dias = (n) => (n === 1 ? '1 dia' : `${n} dias`);

/**
 * Em que pé está o prazo, em palavras, pela regra do proprietário:
 * - passou do "até quando" → "Prazo vencido há 3 dias";
 * - passou do dia agendado (mas não do limite) → "Atrasada há 2 dias";
 * - senão, quanto falta para o limite → "Vence hoje", "Vence amanhã",
 *   "Vence em 4 dias".
 *
 * Recebe o agendamento (precisa das duas datas). Uma data solta ainda é
 * aceita e lida como o limite — é o que a função fazia antes.
 * `hoje` é parâmetro para o teste não depender do relógio.
 */
export function prazoRelativo(schedule, hoje = new Date()) {
  const s = typeof schedule === 'object' && schedule !== null && !(schedule instanceof Date)
    ? schedule
    : { due_date: schedule };
  const limite = parseDateKey(s.due_date);
  if (!limite) return '';
  const paraLimite = differenceInCalendarDays(limite, hoje);
  if (paraLimite < 0) return `Prazo vencido há ${dias(-paraLimite)}`;
  const agendado = parseDateKey(s.scheduled_date);
  const paraAgendado = agendado ? differenceInCalendarDays(agendado, hoje) : 0;
  if (paraAgendado < 0) return `Atrasada há ${dias(-paraAgendado)}`;
  if (paraLimite === 0) return 'Vence hoje';
  if (paraLimite === 1) return 'Vence amanhã';
  return `Vence em ${paraLimite} dias`;
}

/**
 * Os números do mês a partir das vistorias do próprio inspetor.
 *
 * `rows` é a página da listagem `/inspections` (até 100). Vistorias o total da
 * API já responde; andares e dias só se lê da lista, então se o mês tiver mais
 * vistorias do que a página trouxe, os dois ficam nulos — melhor um traço do
 * que um número menor que o real.
 */
export function numerosDoMes(rows = [], total = 0) {
  const completo = rows.length >= total;
  const andares = rows.reduce(
    (soma, r) => soma + (r.floor_form_entries?.length ?? r.floors_inspected?.length ?? 0),
    0
  );
  const dias = new Set(rows.map((r) => dateKeyOf(r.date ?? r.finished_at)).filter(Boolean)).size;
  return {
    vistorias: total,
    andares: completo ? andares : null,
    dias: completo ? dias : null,
  };
}
