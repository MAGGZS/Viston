import { ScheduleStatus } from '@prisma/client';
import { analyticsRepository } from '../repositories/analytics.repository';
import { scheduleRepository } from '../repositories/schedule.repository';
import { OVERVIEW_MAX_DIAS, OverviewQuery } from '../validators/schedule.validator';
import { ValidationError } from '../utils/errors';
import { sortFloorsDesc } from '../utils/floorOrder';
import { zonedDayKey, zonedParts, zonedTimeToUtc } from '../utils/timezone';
import { dayKey, inspetoresAtivos, isCompletedLate, toDateOnly } from './schedule.service';

const UM_DIA_MS = 86_400_000;

/** Dias entre dois `yyyy-MM-dd`, contados no calendário (sem fuso no meio). */
function diasEntre(de: string, ate: string): number {
  return Math.round((toDateOnly(ate).getTime() - toDateOnly(de).getTime()) / UM_DIA_MS);
}

/** O período pedido; sem datas, o mês corrente inteiro. */
function resolvePeriodo(query: OverviewQuery) {
  const { year, monthIndex } = zonedParts();
  const mm = String(monthIndex + 1).padStart(2, '0');
  const ultimo = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  const from = query.from ?? `${year}-${mm}-01`;
  const to = query.to ?? `${year}-${mm}-${String(ultimo).padStart(2, '0')}`;

  // O schema confere quando vêm as duas datas; com uma só, a outra é o mês
  // corrente, e a mesma regra vale para o período que resultou.
  if (to < from) throw new ValidationError('O fim do período não pode ser antes do início');
  if (diasEntre(from, to) + 1 > OVERVIEW_MAX_DIAS) {
    throw new ValidationError(`O período pode ter no máximo ${OVERVIEW_MAX_DIAS} dias`);
  }

  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);

  return {
    from_day: from,
    to_day: to,
    // Os carimbos com hora (o nascimento do chamado) são lidos no fuso do
    // produto: o "dia 1" de quem usa começa à meia-noite de São Paulo.
    from_instant: zonedTimeToUtc(fy, fm - 1, fd),
    to_instant: new Date(zonedTimeToUtc(ty, tm - 1, td + 1).getTime() - 1),
  };
}

/**
 * O painel de quem acompanha o prédio: quem vistoriou, como anda a agenda,
 * os chamados e quanto tempo cada andar está sem ser olhado.
 *
 * A guarda (gestor ou VIEWER) está na rota. Os números da agenda são das
 * rondas agendadas no período: o atraso conta do dia agendado, e é por ele
 * que "deste mês" faz sentido. `overdue` é a pendente cujo dia agendado já
 * passou; `past_deadline` conta, dentre essas, as que passaram também do prazo
 * (o limite final) — é um subconjunto de `overdue`, não uma fatia a mais.
 * `inspectors` lista só quem é INSPECTOR ativo do prédio hoje.
 * `without_inspector` conta, dentre as pendentes do período, as que ficaram
 * sem inspetor (ele saiu do prédio, mudou de papel ou teve a conta suspensa) —
 * não é uma fatia a mais, é um recorte de `pending` + `overdue`.
 * Os chamados são os nascidos no período, contados pelo status de agora. A cobertura não tem período — o
 * andar esquecido há quatro meses é problema de hoje.
 */
export async function supervisorOverview(buildingId: string, query: OverviewQuery) {
  const periodo = resolvePeriodo(query);
  const hoje = zonedDayKey(new Date());

  const [inspetores, rondas, chamados, andares, doPredio] = await Promise.all([
    analyticsRepository.porInspetor({ building_id: buildingId }, periodo),
    scheduleRepository.listForPeriod(buildingId, toDateOnly(periodo.from_day), toDateOnly(periodo.to_day)),
    scheduleRepository.ticketsByStatus(buildingId, periodo.from_instant, periodo.to_instant),
    scheduleRepository.coverage(buildingId),
    scheduleRepository.listInspectors(buildingId),
  ]);
  // Só quem é INSPECTOR com conta ativa do prédio hoje: quem saiu some da
  // lista, mesmo com vistorias no período.
  const inspetoresAtuais = new Set(doPredio.map((i) => i.id));

  // Pendentes cujo inspetor não é mais INSPECTOR ativo do prédio: uma consulta
  // só para o período inteiro (ver `inspetoresAtivos`).
  const ativos = await inspetoresAtivos(rondas.filter((r) => r.status === ScheduleStatus.PENDENTE));

  const schedules = {
    pending: 0,
    overdue: 0,
    past_deadline: 0,
    done_on_time: 0,
    done_late: 0,
    canceled: 0,
    without_inspector: 0,
  };
  for (const r of rondas) {
    if (
      r.status === ScheduleStatus.PENDENTE &&
      (!r.inspector_id || !ativos.has(`${r.building_id}:${r.inspector_id}`))
    ) {
      schedules.without_inspector += 1;
    }
    if (r.status === ScheduleStatus.CANCELADO) schedules.canceled += 1;
    else if (r.status === ScheduleStatus.PENDENTE) {
      if (dayKey(r.scheduled_date) < hoje) schedules.overdue += 1;
      else schedules.pending += 1;
      if (dayKey(r.due_date) < hoje) schedules.past_deadline += 1;
    } else if (isCompletedLate(r)) schedules.done_late += 1;
    else schedules.done_on_time += 1;
  }

  const coverage = sortFloorsDesc(andares).map((a) => ({
    floor_id: a.floor_id,
    label: a.label,
    last_inspected_at: a.last_day,
    days_since: a.last_day ? diasEntre(a.last_day, hoje) : null,
  }));

  return {
    inspectors: inspetores.filter((i) => inspetoresAtuais.has(i.id)).map((i) => ({
      id: i.id,
      name: i.name,
      inspections: i.vistorias,
      days: i.dias,
      floors: i.andares_distintos,
      occurrences: i.ocorrencias,
    })),
    schedules,
    tickets: { by_status: chamados },
    coverage,
  };
}
