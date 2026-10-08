'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarX, ArrowRight } from 'lucide-react';
import { Button, Skeleton, StatCard } from '@/app/components/ui';
import { Barras } from '@/app/components/analytics/Barras';
import { CalendarioMensal, LegendaAgenda } from '@/app/components/agenda/CalendarioMensal';
import { ScheduleDetailsModal } from '@/app/components/agenda/ScheduleDetailsModal';
import { useBuildingSchedules } from '@/app/hooks/useApi';
import { groupSchedulesByDay, formatDataCurta } from '@/app/lib/agenda';
import { RECORD_STATUS } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM } from '@/app/lib/theme';

export const AGENDA_HREF = '/desktop/visualizacao/agenda';

/** Um cartão do painel: título, uma linha do que ele responde, e o miolo. */
export function Bloco({ titulo, descricao, acao, children, className = '', style = {}, id }) {
  return (
    <section
      aria-labelledby={id}
      className={className}
      style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={id} style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text }}>{titulo}</h2>
          {descricao && <p style={{ fontSize: 12, color: T.mute, marginTop: 3, lineHeight: 1.45 }}>{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Vazio({ children }) {
  return <p style={{ fontSize: 13, color: T.faint, padding: '12px 0' }}>{children}</p>;
}

// ── Números do topo ───────────────────────────────────────────────────────────

/**
 * As contagens da agenda, pela regra do proprietário: atrasado é o PENDENTE
 * cujo dia agendado passou; `past_deadline` é a parte deles que passou também
 * do "até quando". `overdue` conta todos os atrasados, com prazo vencido ou
 * não (o mesmo sentido do campo `overdue` de cada agendamento) — por isso o
 * gráfico tira um do outro para não contar duas vezes.
 */
export function contagensDaAgenda(schedules) {
  const s = schedules ?? {};
  const overdue = s.overdue ?? 0;
  const vencidos = Math.min(s.past_deadline ?? 0, overdue);
  return {
    pendentes: s.pending ?? 0,
    atrasados: overdue,
    vencidos,
    atrasadosNoPrazo: overdue - vencidos,
    noPrazo: s.done_on_time ?? 0,
    comAtraso: s.done_late ?? 0,
    cancelados: s.canceled ?? 0,
  };
}

/**
 * `semInspetor`: quantos agendamentos abertos ficaram sem inspetor (ele saiu
 * do prédio) — o `without_inspector` do panorama. Com algum, a dica dos
 * pendentes vira "N sem inspetor", que é o que pede ação.
 */
export function NumerosDaAgenda({ schedules, loading, semInspetor = 0 }) {
  const s = schedules ?? {};
  const c = contagensDaAgenda(schedules);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
      <StatCard
        className="anim-fade-up"
        icon={CalendarClock}
        label="Agendamentos pendentes"
        value={s.pending}
        loading={loading}
        alerta={semInspetor > 0}
        hint={semInspetor > 0 ? `Sem inspetor: ${semInspetor}` : 'O dia agendado ainda não chegou'}
      />
      <StatCard
        className="anim-fade-up anim-d1"
        icon={AlertTriangle}
        label="Atrasadas"
        value={s.overdue}
        loading={loading}
        alerta
        hint={c.vencidos > 0 ? `${c.vencidos} com prazo vencido` : 'O dia agendado passou sem vistoria'}
      />
      <StatCard className="anim-fade-up anim-d2" icon={CalendarCheck} label="Concluídas no dia" value={s.done_on_time} loading={loading} hint="Feitas até o dia agendado" />
      <StatCard className="anim-fade-up anim-d3" icon={CalendarX} label="Concluídas com atraso" value={s.done_late} loading={loading} hint="Feitas depois do dia agendado" />
    </div>
  );
}

// ── Desempenho dos inspetores ─────────────────────────────────────────────────

const COLUNAS = [
  { chave: 'inspections', label: 'Vistorias' },
  { chave: 'days', label: 'Dias' },
  { chave: 'floors', label: 'Andares' },
  { chave: 'occurrences', label: 'Ocorrências' },
];

/**
 * Tabela, e não gráfico: são quatro medidas por pessoa, e quem supervisiona
 * compara a linha inteira de um inspetor com a de outro. A barra fina sob as
 * vistorias dá a proporção sem pedir uma segunda leitura.
 */
export function DesempenhoInspetores({ inspectors, loading }) {
  const lista = useMemo(
    () => [...(inspectors ?? [])].sort((a, b) => b.inspections - a.inspections || a.name.localeCompare(b.name, 'pt-BR')),
    [inspectors]
  );
  const teto = Math.max(1, ...lista.map((i) => i.inspections));

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 36, borderRadius: 8 }} />)}
      </div>
    );
  }
  if (lista.length === 0) return <Vazio>Nenhuma vistoria no período.</Vazio>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${T.line}` }}>
          <th scope="col" style={{ textAlign: 'left', fontSize: 12, fontWeight: W.strong, color: T.mute, padding: '0 8px 8px 0' }}>Inspetor</th>
          {COLUNAS.map((c) => (
            <th key={c.chave} scope="col" style={{ textAlign: 'right', fontSize: 12, fontWeight: W.strong, color: T.mute, padding: '0 0 8px 12px' }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lista.map((i, idx) => (
          // Conta apagada vem com `id: null` — e pode haver mais de uma.
          <tr key={i.id ?? `removido-${idx}`} style={{ borderBottom: `1px solid ${T.line}` }}>
            <th scope="row" style={{ textAlign: 'left', fontWeight: W.body, padding: '10px 8px 10px 0' }}>
              <span style={{ display: 'block', fontSize: 14, color: T.text }}>{i.name}</span>
              <span aria-hidden="true" style={{ display: 'block', marginTop: 6, height: 4, borderRadius: 2, background: T.chip, maxWidth: 220 }}>
                <span style={{ display: 'block', height: '100%', width: `${(i.inspections / teto) * 100}%`, borderRadius: 2, background: 'var(--chart-mark)', transition: 'width 260ms var(--ease-saida)' }} />
              </span>
            </th>
            {COLUNAS.map((c) => (
              <td key={c.chave} style={{ textAlign: 'right', fontSize: 14, color: c.chave === 'inspections' ? T.text : T.mute, fontWeight: c.chave === 'inspections' ? W.title : W.body, padding: '10px 0 10px 12px', ...NUM }}>
                {i[c.chave] ?? 0}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Agendamentos ─────────────────────────────────────────────────────────────

export function GraficoAgendamentos({ schedules, loading }) {
  if (loading) return <Skeleton style={{ height: 150, borderRadius: 8 }} />;
  const c = contagensDaAgenda(schedules);
  const total = c.noPrazo + c.comAtraso + c.atrasados + c.pendentes + c.cancelados;
  if (total === 0) return <Vazio>Nenhum agendamento com prazo no período.</Vazio>;

  const fmt = (n) => `${n}`;
  return (
    <Barras
      medida="Agendamentos"
      itens={[
        { id: 'no-prazo', rotulo: 'Concluídas no dia', valor: c.noPrazo, texto: fmt(c.noPrazo) },
        { id: 'fora', rotulo: 'Concluídas com atraso', valor: c.comAtraso, texto: fmt(c.comAtraso) },
        { id: 'atrasados', rotulo: 'Atrasadas', valor: c.atrasadosNoPrazo, texto: fmt(c.atrasadosNoPrazo), alerta: c.atrasadosNoPrazo > 0 },
        { id: 'prazo-vencido', rotulo: 'Prazo vencido', valor: c.vencidos, texto: fmt(c.vencidos), alerta: c.vencidos > 0 },
        { id: 'pendentes', rotulo: 'Pendentes', valor: c.pendentes, texto: fmt(c.pendentes) },
        { id: 'cancelados', rotulo: 'Canceladas', valor: c.cancelados, texto: fmt(c.cancelados) },
      ]}
    />
  );
}

// ── Chamados ─────────────────────────────────────────────────────────────────

export function ChamadosPorStatus({ byStatus, loading }) {
  if (loading) return <Skeleton style={{ height: 150, borderRadius: 8 }} />;
  const contagem = byStatus ?? {};
  const itens = RECORD_STATUS.map((st) => ({
    id: st.value,
    rotulo: st.label,
    valor: contagem[st.value] ?? 0,
    texto: String(contagem[st.value] ?? 0),
  }));
  if (itens.every((i) => i.valor === 0)) return <Vazio>Nenhum chamado aberto no período.</Vazio>;
  return <Barras medida="Chamados" itens={itens} />;
}

// ── Cobertura ────────────────────────────────────────────────────────────────

/** Acima disto o andar está esquecido; entre os dois, pedindo atenção. */
export const COBERTURA_ALERTA_DIAS = 30;
export const COBERTURA_ATENCAO_DIAS = 14;

/** Nunca vistoriado primeiro; depois do mais antigo para o mais recente. */
export function ordenarCobertura(coverage = []) {
  return [...coverage].sort((a, b) => {
    if (a.days_since === null && b.days_since === null) return 0;
    if (a.days_since === null) return -1;
    if (b.days_since === null) return 1;
    return b.days_since - a.days_since;
  });
}

function textoCobertura(a) {
  if (a.days_since === null) return { texto: 'Nunca vistoriado', cor: T.danger, forte: true };
  if (a.days_since === 0) return { texto: 'Hoje', cor: T.mute, forte: false };
  const texto = `há ${a.days_since} dia${a.days_since !== 1 ? 's' : ''}`;
  if (a.days_since >= COBERTURA_ALERTA_DIAS) return { texto, cor: T.danger, forte: true };
  if (a.days_since >= COBERTURA_ATENCAO_DIAS) return { texto, cor: T.accentInk, forte: true };
  return { texto, cor: T.mute, forte: false };
}

const COBERTURA_VISIVEIS = 8;

export function CoberturaDeAndares({ coverage, loading }) {
  const [todos, setTodos] = useState(false);
  const lista = useMemo(() => ordenarCobertura(coverage), [coverage]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 28, borderRadius: 8 }} />)}
      </div>
    );
  }
  if (lista.length === 0) return <Vazio>O prédio ainda não tem andares cadastrados.</Vazio>;

  const visiveis = todos ? lista : lista.slice(0, COBERTURA_VISIVEIS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visiveis.map((a) => {
          const { texto, cor, forte } = textoCobertura(a);
          return (
            <li
              key={a.floor_id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${T.line}` }}
            >
              <span style={{ fontSize: 13, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
              <span
                title={a.last_inspected_at ? `Última vistoria em ${formatDataCurta(a.last_inspected_at)}` : undefined}
                style={{ fontSize: 12, color: cor, fontWeight: forte ? W.strong : W.body, flexShrink: 0, ...NUM }}
              >
                {texto}
              </span>
            </li>
          );
        })}
      </ul>
      {lista.length > COBERTURA_VISIVEIS && (
        <button
          type="button"
          className="link-acao"
          onClick={() => setTodos((v) => !v)}
          aria-expanded={todos}
          style={{ alignSelf: 'flex-start', minHeight: 32, padding: '0 2px', fontSize: 12, fontWeight: W.strong, color: T.text }}
        >
          {todos ? 'Mostrar menos' : `Ver todos os ${lista.length} andares`}
        </button>
      )}
    </div>
  );
}

// ── Calendário ───────────────────────────────────────────────────────────────

/**
 * O mês da agenda, de relance.
 *
 * O dia com bolinha abre a caixa com os agendamentos dele; o lápis de cada um
 * leva para a agenda já com a edição aberta (`?agendamento=`). Editar aqui, na
 * caixa, duplicaria o formulário que a agenda tem inteiro.
 */
export function CalendarioDoPainel({ buildingId }) {
  const router = useRouter();
  const agora = new Date();
  const [month, setMonth] = useState(agora.getMonth() + 1);
  const [year, setYear] = useState(agora.getFullYear());
  const [dia, setDia] = useState(null);

  const { data, isError } = useBuildingSchedules(buildingId, { month, year });
  const marks = useMemo(() => groupSchedulesByDay(data?.schedules ?? []), [data]);

  return (
    <>
      <CalendarioMensal
        month={month}
        year={year}
        onMonthChange={(m, y) => { setMonth(m); setYear(y); }}
        selectedDate={dia}
        onSelectDate={(key) => setDia(marks[key]?.length ? key : null)}
        marks={marks}
        size="compact"
      />
      {isError ? (
        <p role="alert" style={{ fontSize: 12, color: T.danger }}>Não foi possível carregar a agenda deste mês.</p>
      ) : (
        <LegendaAgenda />
      )}

      <ScheduleDetailsModal
        open={!!dia}
        onClose={() => setDia(null)}
        schedules={dia ? marks[dia] ?? [] : []}
        dateKey={dia}
        showBuilding={false}
        onEdit={(s) => router.push(`${AGENDA_HREF}?data=${String(s.scheduled_date).slice(0, 10)}&agendamento=${s.id}`)}
        footer={
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => router.push(`${AGENDA_HREF}?data=${dia}`)}>
            Abrir na agenda
          </Button>
        }
      />
    </>
  );
}

export function LinkParaAgenda() {
  return (
    <Link
      href={AGENDA_HREF}
      className="link-acao"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, fontSize: 12, fontWeight: W.strong, color: T.text, textDecoration: 'none', padding: '0 8px', borderRadius: R.badge, flexShrink: 0 }}
    >
      Abrir agenda <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}
