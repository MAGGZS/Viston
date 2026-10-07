'use client';
import { useCallback, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';
import { LegendaAgenda } from '@/app/components/agenda/CalendarioMensal';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { useCalendar, useMySchedules } from '@/app/hooks/useApi';
import { dateKeyOf, groupSchedulesByDay, parseDateKey } from '@/app/lib/agenda';
import { HEAT, T, W } from '@/app/lib/theme';

/**
 * O fundo do dia em que houve vistoria feita.
 *
 * Um degrau só da rampa do calendário de atividade, e não a rampa inteira: o
 * dia cheio da rampa é o próprio dourado, e aqui o dourado já quer dizer "o dia
 * que você escolheu". O que o heatmap dizia em intensidade (quantas) passou
 * para o nome acessível do dia e para a caixa que ele abre.
 */
export const TINT_VISTORIA_FEITA = HEAT[1];

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * A agenda do inspetor — o mesmo comportamento no telefone e no computador.
 *
 * O calendário passou a falar de duas coisas: o que está marcado (bolinhas, de
 * `/me/schedules`) e o que já foi feito (fundo do dia, do `/calendar` que antes
 * desenhava o heatmap). Tocar um dia abre o que houver nele:
 *
 * - com agendamento: a caixa da agenda daquele dia, e — se também houve
 *   vistoria — um botão no pé dela leva às vistorias feitas;
 * - só com vistoria feita: direto o relatório do dia, como era antes;
 * - vazio: só marca o dia.
 *
 * `buildingId` vai para a consulta do calendário só para manter a chave de
 * cache que a tela inicial já usava (os números do cartão saem do mesmo dado).
 */
export function useAgendaDoInspetor({ enabled = true, buildingId } = {}) {
  const now = new Date();
  const [month, setMonthState] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  // O dia cuja agenda está aberta. A caixa só aparece quando o mês dele
  // terminar de chegar — ver `pronto` abaixo.
  const [agendaDoDia, setAgendaDoDia] = useState(null);
  const [vistoriasDoDia, setVistoriasDoDia] = useState(null);
  // O aviso do sino que abriu a agenda: `{ scheduleId, payload, cancelado }`.
  // Com ele a caixa sabe se o agendamento do aviso ainda está no dia.
  const [doAviso, setDoAviso] = useState(null);

  const schedulesQuery = useMySchedules({ month, year }, { enabled });
  const calendarParams = enabled
    ? buildingId ? { month, year, building_id: buildingId } : { month, year }
    : null;
  const calendarQuery = useCalendar(calendarParams);

  const schedules = useMemo(() => schedulesQuery.data?.schedules ?? [], [schedulesQuery.data]);
  const marks = useMemo(() => groupSchedulesByDay(schedules), [schedules]);
  const heatmap = useMemo(() => calendarQuery.data?.heatmap ?? {}, [calendarQuery.data]);

  const getDayHint = useCallback(
    (key) => {
      const count = heatmap[key]?.count ?? 0;
      if (!count) return null;
      return {
        tint: TINT_VISTORIA_FEITA,
        label: plural(count, 'vistoria feita', 'vistorias feitas'),
      };
    },
    [heatmap]
  );

  function setMonth(m, y) {
    setMonthState(m);
    setYear(y);
  }

  function abrirVistorias(key) {
    const info = heatmap[key];
    if (info?.count) setVistoriasDoDia({ day: key, info });
  }

  function abrirDia(key) {
    setDoAviso(null);
    setSelectedDate(key);
    if (marks[key]?.length) {
      setAgendaDoDia(key);
      return;
    }
    abrirVistorias(key);
  }

  /**
   * O aviso do sino (ou um item da lista de próximos) leva ao dia do
   * agendamento: o calendário vai ao mês dele, marca o dia e abre a agenda
   * daquele dia assim que o mês chegar.
   *
   * Aviso de cancelamento não tem o que procurar no dia — o agendamento saiu
   * da agenda. A caixa mostra o que o próprio aviso traz (prédio, andares,
   * data, prazo) dizendo que foi cancelado; o mesmo vale para um aviso cujo
   * agendamento não está mais no dia (remarcado, passado a outro inspetor).
   */
  function abrirAgendamento(payload = {}, notification) {
    const key = dateKeyOf(payload.scheduled_date ?? payload.due_date);
    const d = key ? parseDateKey(key) : null;
    if (!d) return;
    setMonth(d.getMonth() + 1, d.getFullYear());
    setSelectedDate(key);
    setAgendaDoDia(key);
    setDoAviso(
      notification
        ? {
            scheduleId: payload.schedule_id ?? null,
            payload,
            cancelado: notification.type === 'SCHEDULE_CANCELED',
          }
        : null
    );
  }

  // Enquanto o mês pedido não chega, `keepPreviousData` segura o anterior — e a
  // caixa abriria dizendo "nenhuma vistoria agendada" para um dia que tem.
  const pronto = !!schedulesQuery.data && !schedulesQuery.isPlaceholderData;

  return {
    month,
    year,
    setMonth,
    selectedDate,
    marks,
    schedules,
    heatmap,
    getDayHint,
    abrirDia,
    abrirAgendamento,
    isLoading: schedulesQuery.isLoading,
    isError: schedulesQuery.isError,
    refetch: schedulesQuery.refetch,
    calendarLoading: calendarQuery.isLoading,
    modais: {
      agendaDoDia,
      agendaAberta: !!agendaDoDia && pronto,
      doAviso,
      fecharAgenda: () => {
        setAgendaDoDia(null);
        setDoAviso(null);
      },
      vistoriasDoDia,
      fecharVistorias: () => setVistoriasDoDia(null),
      abrirVistorias,
    },
  };
}

/**
 * Um `Schedule` montado só com o que o aviso do sino traz — para mostrar um
 * agendamento que não existe mais na agenda. Os andares chegam como
 * `[{ label }]` ou `['3º andar']`.
 */
export function agendamentoDoAviso(payload = {}, cancelado = false) {
  return {
    id: payload.schedule_id ?? 'aviso',
    building_name: payload.building_name,
    scheduled_date: payload.scheduled_date,
    due_date: payload.due_date,
    status: cancelado ? 'CANCELADO' : undefined,
    floors: (payload.floors ?? []).map((f, i) =>
      typeof f === 'string' ? { id: `f${i}`, label: f } : { id: f?.id ?? `f${i}`, label: f?.label }
    ).filter((f) => f.label),
  };
}

/** As duas caixas que o calendário do inspetor abre. */
export function AgendaDoInspetorModais({ agenda }) {
  const { marks, heatmap, modais } = agenda;
  const key = modais.agendaDoDia;
  const feitas = key ? heatmap[key]?.count ?? 0 : 0;
  const doDia = key ? marks[key] ?? [] : [];
  const aviso = modais.doAviso;
  const sumiu =
    !!aviso &&
    (aviso.cancelado || (!!aviso.scheduleId && !doDia.some((s) => s.id === aviso.scheduleId)));

  const footer = feitas > 0 ? (
    <button
      type="button"
      className="link-acao link-acao--acento"
      onClick={() => {
        modais.fecharAgenda();
        modais.abrirVistorias(key);
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
        padding: '0 4px', color: T.accentInk, fontSize: 14, fontWeight: W.strong,
      }}
    >
      <ClipboardCheck size={16} aria-hidden="true" />
      Ver {plural(feitas, 'vistoria feita', 'vistorias feitas')} neste dia
    </button>
  ) : null;

  return (
    <>
      {sumiu ? (
        <ScheduleDetailsModal
          open={modais.agendaAberta}
          onClose={modais.fecharAgenda}
          schedules={[agendamentoDoAviso(aviso.payload, aviso.cancelado)]}
          title={aviso.cancelado ? 'Agendamento cancelado' : 'Agendamento indisponível'}
          aviso={
            aviso.cancelado
              ? 'Esta vistoria foi cancelada e saiu da sua agenda. Os dados abaixo são os do aviso.'
              : 'Este agendamento não está mais na sua agenda — pode ter sido remarcado, cancelado ou passado a outro inspetor. Os dados abaixo são os do aviso.'
          }
          showStatus={aviso.cancelado}
          showBuilding
          showInspector={false}
        />
      ) : (
        <ScheduleDetailsModal
          open={modais.agendaAberta}
          onClose={modais.fecharAgenda}
          schedules={doDia}
          dateKey={key}
          showBuilding
          showInspector={false}
          footer={footer}
        />
      )}
      <DayInspectionsModal
        open={!!modais.vistoriasDoDia}
        onClose={modais.fecharVistorias}
        day={modais.vistoriasDoDia?.day}
        info={modais.vistoriasDoDia?.info}
      />
    </>
  );
}

/** A legenda das bolinhas, e o fundo do dia com vistoria feita. */
export function LegendaDoInspetor() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' }}>
      <LegendaAgenda />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.mute }}>
        <span
          aria-hidden="true"
          style={{ width: 12, height: 12, borderRadius: 4, background: TINT_VISTORIA_FEITA, boxShadow: `inset 0 0 0 1px ${T.line}` }}
        />
        Vistoria feita
      </span>
    </div>
  );
}
