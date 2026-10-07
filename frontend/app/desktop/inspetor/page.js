'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Layers,
  RotateCcw,
  Smartphone,
  SquareKanban,
} from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { SoNoComputador } from '@/app/components/TelaPorLargura';
import { InspetorSidebar } from '@/app/components/InspetorSidebar';
import { NotificacoesSino } from '@/app/components/NotificacoesSino';
import { NotificacaoChamados } from '@/app/components/NotificacaoChamados';
import { CalendarioMensal } from '@/app/components/agenda/CalendarioMensal';
import { ScheduleListItem } from '@/app/components/agenda/ScheduleListItem';
import {
  AgendaDoInspetorModais,
  LegendaDoInspetor,
  useAgendaDoInspetor,
  useMeuMes,
} from '@/app/components/agenda/AgendaDoInspetor';
import { Badge, Button, Skeleton, StatCard } from '@/app/components/ui';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { useMySchedules } from '@/app/hooks/useApi';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import {
  estiloMarca,
  formatAte,
  formatDiaCurto,
  formatMesAno,
  isAtrasado,
  resumoAndares,
  scheduleState,
  scheduleStateMeta,
} from '@/app/lib/agenda';
import { isResponsible } from '@/app/lib/roles';
import { useAuthStore } from '@/app/store/auth';
import { T, R, W, NUM } from '@/app/lib/theme';
import { numerosDoMes, ordenarProximos, prazoRelativo } from './proximos';

/** Quantos próximos a lista mostra antes do "+N". */
const MAX_PROXIMOS = 6;

const CARD = { background: T.card, borderRadius: R.card, boxShadow: T.cardRing };

/** Só os prédios em que a conta vistoria: a agenda desta mesa é de inspetor. */
const PREDIO_DE_INSPETOR = (b) => b.role === 'INSPECTOR';

function capitalizar(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function SectionTitle({ children, aside, id }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <h2 id={id} style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text, letterSpacing: '-0.005em' }}>
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** O prazo que vence primeiro, em destaque — o que a pessoa precisa ver antes de tudo. */
function ProximoPrazo({ schedule, onOpen }) {
  const meta = scheduleStateMeta(schedule);
  const estado = scheduleState(schedule);
  // Prazo vencido é vermelho; o resto fica no neutro forte — o dourado é de
  // ação, e o atrasado se distingue pelo triângulo na etiqueta (lib/agenda).
  const corDoPrazo = estado === 'prazo_vencido' ? T.danger : T.text;
  const andares = resumoAndares(schedule.floors, 3);

  return (
    <section
      aria-labelledby="proximo-prazo"
      className="anim-fade-up anim-d4"
      style={{ ...CARD, padding: 20, display: 'flex', gap: 14 }}
    >
      <span aria-hidden="true" style={{ width: 4, borderRadius: 999, flexShrink: 0, ...estiloMarca(estado, { espessura: 1.25 }) }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          id="proximo-prazo"
          style={{ fontSize: 11, fontWeight: W.strong, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.mute }}
        >
          Próximo prazo
        </p>
        <p
          style={{
            fontFamily: T.display, fontSize: 24, fontWeight: W.title, lineHeight: '30px', marginTop: 6,
            letterSpacing: '-0.01em', color: corDoPrazo,
          }}
        >
          {prazoRelativo(schedule)}
        </p>
        <p style={{ fontSize: 14, fontWeight: W.strong, color: T.text, marginTop: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* O prédio é o escolhido no cabeçalho — repeti-lo aqui seria ruído. */}
          {andares || 'Vistoria agendada'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Badge variant={meta.badge}>
            {meta.alerta && <AlertTriangle size={12} aria-hidden="true" />}
            {meta.label}
          </Badge>
          <span style={{ ...NUM, fontSize: 12, color: T.faint, textTransform: 'capitalize' }}>
            {formatDiaCurto(schedule.scheduled_date)} · {formatAte(schedule.due_date)}
          </span>
        </div>
        <Button variant="secondary" onClick={() => onOpen(schedule)} className="press" style={{ width: '100%', marginTop: 16, minHeight: 44 }}>
          <CalendarDays size={16} aria-hidden="true" /> Ver no calendário
        </Button>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.faint, marginTop: 10 }}>
          <Smartphone size={13} aria-hidden="true" /> A vistoria é feita pelo app no celular.
        </p>
      </div>
    </section>
  );
}

/**
 * `proximos` já vem sem o que está no destaque "Próximo prazo" (`destacado`):
 * repetir o mesmo agendamento nos dois cartões lado a lado seria ruído.
 */
function ListaDeProximos({ query, proximos, onOpen, destacado = false }) {
  const restantes = Math.max(0, proximos.length - MAX_PROXIMOS);

  let corpo;
  if (query.isLoading) {
    corpo = (
      <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 56 }} />)}
      </div>
    );
  } else if (query.isError) {
    corpo = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <p role="alert" style={{ color: T.mute, fontSize: 14 }}>Não foi possível carregar seus agendamentos.</p>
        <button
          type="button"
          className="link-acao link-acao--acento"
          onClick={() => query.refetch()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.accentInk, fontSize: 13, fontWeight: W.strong, minHeight: 44 }}
        >
          <RotateCcw size={14} aria-hidden="true" /> Tentar de novo
        </button>
      </div>
    );
  } else if (proximos.length === 0 && destacado) {
    corpo = (
      <p style={{ fontSize: 13, color: T.mute, lineHeight: 1.55 }}>
        Nenhum outro agendamento além do próximo prazo.
      </p>
    );
  } else if (proximos.length === 0) {
    corpo = (
      <div style={{ textAlign: 'center', padding: '20px 8px 12px' }}>
        <span
          aria-hidden="true"
          className="anim-pop-in"
          style={{ width: 44, height: 44, borderRadius: R.badge, background: T.chip, color: T.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <CalendarCheck2 size={20} />
        </span>
        <p style={{ fontFamily: T.display, fontSize: 14, fontWeight: W.strong, color: T.text, marginTop: 12 }}>
          Nada agendado por enquanto
        </p>
        <p style={{ fontSize: 13, color: T.mute, marginTop: 4, lineHeight: 1.55 }}>
          Quando uma vistoria for marcada para você, ela aparece aqui e no sino.
        </p>
      </div>
    );
  } else {
    corpo = (
      <>
        <ul aria-label="Próximos agendamentos" style={{ listStyle: 'none', padding: 0, margin: '0 -12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {proximos.slice(0, MAX_PROXIMOS).map((s, i) => (
            <li key={s.id} className={`anim-fade-up anim-d${Math.min(i + 1, 6)}`}>
              <ScheduleListItem schedule={s} showInspector={false} onClick={onOpen} />
            </li>
          ))}
        </ul>
        {restantes > 0 && (
          <p style={{ fontSize: 12, color: T.faint, marginTop: 10, textAlign: 'center' }}>
            e mais {plural(restantes, 'agendamento', 'agendamentos')} — veja no calendário
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="proximos-titulo" className="anim-fade-up anim-d5" style={{ ...CARD, padding: 20 }}>
      <SectionTitle
        id="proximos-titulo"
        aside={proximos.length > 0 ? <Badge>{proximos.length}</Badge> : null}
      >
        Próximos agendamentos
      </SectionTitle>
      {corpo}
    </section>
  );
}

export default function InspetorDesktopPage() {
  const { user } = useAuthStore();
  const now = new Date();
  // O prédio de que a mesa fala — o mesmo escolhido no resto do app. Cada
  // prédio tem a sua agenda, o seu sino e os seus números; trocar aqui troca
  // tudo, porque o id entra na chave de cada consulta.
  const { buildings, buildingId, setActive } = useActiveBuilding({ filter: PREDIO_DE_INSPETOR });
  const pronto = !!user && !!buildingId;
  const agenda = useAgendaDoInspetor({ enabled: pronto, buildingId });

  // Os pendentes dele no prédio, sem recorte de mês: a lista de próximos e o
  // contador de pendentes não podem esquecer o prazo que vence mês que vem.
  // Só PENDENTE — sem mês, pedir tudo traria o histórico inteiro de
  // concluídos. As bolinhas do calendário continuam na consulta do mês
  // (`useAgendaDoInspetor`), que traz também concluídos e cancelados.
  const todos = useMySchedules({ building_id: buildingId, status: 'PENDENTE' }, { enabled: pronto });
  const proximos = useMemo(() => ordenarProximos(todos.data?.schedules ?? []), [todos.data]);
  const atrasados = proximos.filter(isAtrasado).length;

  const mes = useMeuMes(user?.id, buildingId, agenda.month, agenda.year);
  const numeros = useMemo(
    () => numerosDoMes(mes.data?.inspections ?? [], mes.data?.total ?? 0),
    [mes.data]
  );
  const mesLabel = formatMesAno(agenda.month, agenda.year);
  const noMesAtual = agenda.month === now.getMonth() + 1 && agenda.year === now.getFullYear();

  const primeiroNome = user?.name?.split(' ')[0] ?? '';
  const resumo = todos.isLoading
    ? ' '
    : proximos.length === 0
      ? 'Nenhuma vistoria por fazer agora. Bom momento para revisar o histórico.'
      : atrasados > 0
        ? `${plural(proximos.length, 'vistoria por fazer', 'vistorias por fazer')} — ${plural(atrasados, 'atrasada', 'atrasadas')}.`
        : `${plural(proximos.length, 'vistoria por fazer', 'vistorias por fazer')}. O prazo mais próximo está ao lado.`;

  // Erro nos números do mês vira traço, e não zero: zero seria uma afirmação.
  const valor = (v) => (mes.isError || v === null ? '—' : v);

  return (
    <RouteGuard roles={['INSPECTOR']}>
      <SoNoComputador
        destinoNoCelular="/home"
        texto="No celular, a sua agenda e a vistoria ficam na tela inicial."
      >
        <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
          <InspetorSidebar buildingName={buildings.find((b) => b.building_id === buildingId)?.name} />

          <main id={CONTENT_ID} style={{ flex: 1, minWidth: 0, maxHeight: '100vh', overflowY: 'auto' }}>
            <div style={{ maxWidth: 1160, margin: '0 auto', padding: '36px 40px 56px' }}>
              {/* Posicionado e acima do miolo: o sino abre caixa, e sem z-index
                  o conteúdo que vem depois ganharia o empilhamento. */}
              <header
                className="anim-fade-down"
                style={{ position: 'relative', zIndex: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 28 }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: T.mute }}>
                    {capitalizar(format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))}
                  </p>
                  <h1 style={{ fontFamily: T.display, fontSize: 30, fontWeight: W.title, color: T.text, letterSpacing: '-0.02em', lineHeight: 1.15, marginTop: 4 }}>
                    Olá, <span style={{ color: T.text }}>{primeiroNome}</span>
                  </h1>
                  <p style={{ fontSize: 14, color: T.mute, marginTop: 6, minHeight: 21 }}>{resumo}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {/* Quem vistoria e também atende chamado: a mesa do
                      responsável continua a um clique, como era na tela de
                      visualização. */}
                  {isResponsible(user) && (
                    <Link
                      href="/responsavel/chamados"
                      className="linha-clicavel"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 14px', borderRadius: R.control, color: T.text, fontSize: 13, textDecoration: 'none', boxShadow: `inset 0 0 0 1px ${T.line}` }}
                    >
                      <SquareKanban size={15} color={T.accentInk} aria-hidden="true" /> Meus chamados
                    </Link>
                  )}
                  <NotificacaoChamados destino="/responsavel/chamados" />
                  {/* Some sozinho com um prédio só (ver BuildingSwitcher). */}
                  <BuildingSwitcher buildings={buildings} buildingId={buildingId} onChange={setActive} />
                  <NotificacoesSino buildingId={buildingId} enabled={pronto} onOpenSchedule={(payload, aviso) => agenda.abrirAgendamento(payload, aviso)} />
                </div>
              </header>

              {/* Os números do mês exibido no calendário — as setas de lá
                  mudam os daqui. Pendentes é de todos os meses. */}
              <section aria-labelledby="numeros-titulo" style={{ marginBottom: 24 }}>
                <h2 id="numeros-titulo" className="anim-fade-up" style={{ fontSize: 13, fontWeight: W.strong, color: T.mute, marginBottom: 12 }}>
                  Seu mês · <span style={{ color: T.text }}>{mesLabel}</span>
                </h2>
                <div className="grid grid-cols-2 xl:grid-cols-4" style={{ gap: 12 }}>
                  <StatCard
                    className="anim-fade-up anim-d1"
                    icon={ClipboardCheck}
                    label="Vistorias"
                    value={valor(numeros.vistorias)}
                    hint="feitas por você no mês"
                    loading={mes.isLoading}
                  />
                  <StatCard
                    className="anim-fade-up anim-d2"
                    icon={Layers}
                    label="Andares vistoriados"
                    value={valor(numeros.andares)}
                    hint={numeros.andares === null && !mes.isError ? 'mês com mais de 100 vistorias' : 'somando todas as vistorias'}
                    loading={mes.isLoading}
                  />
                  <StatCard
                    className="anim-fade-up anim-d3"
                    icon={CalendarDays}
                    label="Dias em campo"
                    value={valor(numeros.dias)}
                    hint="dias com ao menos uma vistoria"
                    loading={mes.isLoading}
                  />
                  <StatCard
                    className="anim-fade-up anim-d4"
                    icon={CalendarClock}
                    label="Pendentes"
                    value={todos.isError ? '—' : proximos.length}
                    hint={atrasados > 0 ? plural(atrasados, 'atrasado', 'atrasados') : 'neste prédio'}
                    alerta={atrasados > 0}
                    loading={todos.isLoading}
                  />
                </div>
              </section>

              <div className="grid xl:grid-cols-[minmax(0,1fr)_380px]" style={{ gap: 20, alignItems: 'start' }}>
                <section aria-labelledby="agenda-titulo" className="anim-fade-up anim-d3" style={{ ...CARD, padding: 24 }}>
                  <SectionTitle
                    id="agenda-titulo"
                    aside={
                      !noMesAtual && (
                        <button
                          type="button"
                          className="link-acao link-acao--acento anim-fade-in"
                          onClick={() => agenda.setMonth(now.getMonth() + 1, now.getFullYear())}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.accentInk, fontSize: 13, fontWeight: W.strong, minHeight: 36 }}
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Voltar para hoje
                        </button>
                      )
                    }
                  >
                    Sua agenda
                  </SectionTitle>

                  <CalendarioMensal
                    month={agenda.month}
                    year={agenda.year}
                    onMonthChange={agenda.setMonth}
                    selectedDate={agenda.selectedDate}
                    onSelectDate={agenda.abrirDia}
                    marks={agenda.marks}
                    getDayHint={agenda.getDayHint}
                    marcaSecundaria={agenda.predioTodo ? agenda.deColega : undefined}
                    size="compact"
                    label="Sua agenda de vistorias"
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 16px', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                    <LegendaDoInspetor colegas={agenda.predioTodo} />
                    <p style={{ fontSize: 12, color: T.faint }}>Clique num dia marcado para ver os detalhes</p>
                  </div>
                  {agenda.isError && (
                    <p role="alert" style={{ fontSize: 13, color: T.mute, marginTop: 10 }}>
                      Não foi possível carregar os agendamentos deste mês.{' '}
                      <button type="button" className="link-acao link-acao--acento" onClick={() => agenda.refetch()} style={{ color: T.accentInk, fontSize: 13, minHeight: 36 }}>
                        Tentar de novo
                      </button>
                    </p>
                  )}
                </section>

                <div className="grid lg:grid-cols-2 xl:grid-cols-1" style={{ gap: 20, alignItems: 'start' }}>
                  {proximos[0] && <ProximoPrazo schedule={proximos[0]} onOpen={agenda.abrirAgendamento} />}
                  <ListaDeProximos
                    query={todos}
                    proximos={proximos[0] ? proximos.slice(1) : proximos}
                    destacado={!!proximos[0]}
                    onOpen={agenda.abrirAgendamento}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>

        <AgendaDoInspetorModais agenda={agenda} />
      </SoNoComputador>
    </RouteGuard>
  );
}
