'use client';
import { useCallback, useMemo, useState } from 'react';
import { endOfMonth, format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, RotateCcw } from 'lucide-react';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';
import { LegendaAgenda } from '@/app/components/agenda/CalendarioMensal';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { useBuildingSchedules, useCalendar, useMySchedules } from '@/app/hooks/useApi';
import { useAuthStore } from '@/app/store/auth';
import { canInspect } from '@/app/lib/roles';
import api from '@/app/lib/api';
import { dateKeyOf, groupSchedulesByDay, parseDateKey } from '@/app/lib/agenda';
import { HEAT, T, W } from '@/app/lib/theme';

/**
 * As vistorias do próprio inspetor num mês, numa página de até 100.
 *
 * Direto da listagem `/inspections` (com `inspector_id`), e não do `/calendar`:
 * o calendário traz o nome de quem vistoriou, não o id, e contar por nome
 * juntaria dois inspetores homônimos. A chave começa com 'inspections' para a
 * vistoria enviada no celular invalidar estes números também.
 *
 * Do prédio escolhido: cada prédio tem a sua agenda e as suas demandas, e os
 * números ao lado do calendário falam do mesmo prédio que ele. Usada pela mesa
 * do inspetor no computador e pela tela inicial do celular.
 */
export function useMeuMes(userId, buildingId, month, year, { enabled = true } = {}) {
  const inicio = new Date(year, month - 1, 1);
  const params = {
    building_id: buildingId,
    inspector_id: userId,
    date_from: format(inicio, 'yyyy-MM-dd'),
    date_to: format(endOfMonth(inicio), 'yyyy-MM-dd'),
    page: 1,
    limit: 100,
  };
  return useQuery({
    queryKey: ['inspections', 'mes-do-inspetor', params],
    queryFn: () => api.get('/inspections', { params }).then((r) => r.data),
    enabled: enabled && !!userId && !!buildingId,
  });
}

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
 * `buildingId` é o prédio escolhido (`useActiveBuilding`): cada prédio tem a
 * sua agenda e as suas demandas, então os agendamentos e o calendário de
 * vistorias feitas vêm só dele — e, com ele na chave das consultas, trocar de
 * prédio troca tudo. Sem `buildingId`, a agenda cruza todos os prédios.
 *
 * Com o prédio, as bolinhas são do prédio inteiro (decisão do proprietário): o
 * inspetor vê também os agendamentos dos colegas, só para leitura. Os dele são
 * a marca normal; os dos colegas, a menor (`deColega`), e a caixa do dia diz
 * de quem é cada um. Sem prédio, só os dele, de todos os prédios.
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

  const { user } = useAuthStore();
  const userId = user?.id ?? null;
  // O prédio inteiro só para quem vistoria nele — é o que a API libera ao
  // inspetor. Outra conta na tela inicial (o responsável, por exemplo) segue
  // com a própria agenda daquele prédio.
  const predioTodo = !!buildingId && canInspect(user, buildingId);
  const doPredio = useBuildingSchedules(buildingId, { month, year }, { enabled: enabled && predioTodo });
  const meus = useMySchedules(
    buildingId ? { month, year, building_id: buildingId } : { month, year },
    { enabled: enabled && !predioTodo }
  );
  const schedulesQuery = predioTodo ? doPredio : meus;
  const calendarParams = enabled
    ? buildingId ? { month, year, building_id: buildingId } : { month, year }
    : null;
  const calendarQuery = useCalendar(calendarParams);

  const schedules = useMemo(() => schedulesQuery.data?.schedules ?? [], [schedulesQuery.data]);
  const marks = useMemo(() => groupSchedulesByDay(schedules), [schedules]);
  // Agendamento de colega: tem inspetor, e não é a conta. Sem inspetor
  // nenhum (conta apagada) também não é "meu".
  const deColega = useCallback((s) => predioTodo && !!userId && s?.inspector?.id !== userId, [predioTodo, userId]);
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
  // Se a agenda não carregou, o aviso do sino ainda abre: com os dados que o
  // próprio aviso traz e a chance de tentar de novo (ver os modais abaixo).
  const falhouComAviso = schedulesQuery.isError && !!doAviso;

  return {
    month,
    year,
    setMonth,
    selectedDate,
    marks,
    schedules,
    deColega,
    predioTodo,
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
      agendaAberta: !!agendaDoDia && (pronto || falhouComAviso),
      falhou: falhouComAviso && !pronto,
      tentarDeNovo: schedulesQuery.refetch,
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
  const { marks, heatmap, modais, deColega } = agenda;
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
      {modais.falhou ? (
        <ScheduleDetailsModal
          open={modais.agendaAberta}
          onClose={modais.fecharAgenda}
          schedules={[agendamentoDoAviso(aviso.payload, aviso.cancelado)]}
          title={aviso.cancelado ? 'Agendamento cancelado' : 'Vistoria agendada'}
          aviso="Não foi possível carregar sua agenda agora. Os dados abaixo são os do aviso."
          showStatus={aviso.cancelado}
          showBuilding={false}
          showInspector={false}
          footer={
            <button
              type="button"
              className="link-acao"
              onClick={() => modais.tentarDeNovo()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 4px', color: T.text, fontSize: 14, fontWeight: W.strong }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Tentar de novo
            </button>
          }
        />
      ) : sumiu ? (
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
          showBuilding={false}
          showInspector={false}
        />
      ) : (
        <ScheduleDetailsModal
          open={modais.agendaAberta}
          onClose={modais.fecharAgenda}
          schedules={doDia}
          dateKey={key}
          showBuilding={false}
          showInspector={deColega ?? false}
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

/**
 * A legenda das bolinhas, e o fundo do dia com vistoria feita. `colegas` põe
 * a marca menor, dos agendamentos dos outros inspetores do prédio.
 */
export function LegendaDoInspetor({ colegas = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px' }}>
      <LegendaAgenda />
      {colegas && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.mute }}>
          <span aria-hidden="true" style={{ width: 8, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.text }} />
          </span>
          De um colega
        </span>
      )}
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
