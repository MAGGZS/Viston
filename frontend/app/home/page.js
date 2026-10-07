'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { BottomNav } from '@/app/components/BottomNav';
import { SoNoCelular } from '@/app/components/TelaPorLargura';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { NotificacaoChamados } from '@/app/components/NotificacaoChamados';
import { NotificacoesSino } from '@/app/components/NotificacoesSino';
import { CalendarioMensal } from '@/app/components/agenda/CalendarioMensal';
import {
  AgendaDoInspetorModais,
  LegendaDoInspetor,
  useAgendaDoInspetor,
  useMeuMes,
} from '@/app/components/agenda/AgendaDoInspetor';
import { useMySchedules } from '@/app/hooks/useApi';
import { numerosDoMes } from '@/app/desktop/inspetor/proximos';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import { Skeleton } from '@/app/components/ui';
import { M, MPage, MTopBar, MRound, MCard, MStats, MSectionHead } from '@/app/components/mobile/kit';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { useAuthStore } from '@/app/store/auth';
import { canInspect } from '@/app/lib/roles';
import { R } from '@/app/lib/theme';

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();

  // O prédio de que esta tela fala. Com dois vínculos, quem escolhe é a pessoa
  // — antes ela via só o primeiro da lista, sem saber que havia outro.
  const {
    buildings: myBuildings,
    buildingId,
    setActive,
    hasChoice,
    isLoading: buildingsLoading,
  } = useActiveBuilding();
  const hasBuilding = myBuildings.length > 0;

  // O calendário fala de duas coisas: o que está agendado para você (as
  // bolinhas) e o que já foi feito (o fundo do dia, que antes era o heatmap).
  // Ver `useAgendaDoInspetor`.
  const agenda = useAgendaDoInspetor({ enabled: hasBuilding, buildingId });
  const heatmap = agenda.heatmap;

  // Números do mês, direto do calendário
  const stats = useMemo(() => {
    const days = Object.values(heatmap);
    const vistorias = days.reduce((sum, d) => sum + (d.count ?? 0), 0);
    const inspetores = new Set(days.flatMap((d) => d.inspectors ?? [])).size;
    return { vistorias, dias: days.length, inspetores };
  }, [heatmap]);

  // Vistoriar é permissão do prédio, não da conta: quem só acompanha este aqui
  // não vê o botão, mesmo que vistorie outro.
  const podeVistoriar = canInspect(user, buildingId);

  // Quem vistoria neste prédio vê os números dele no mês exibido — as mesmas
  // fontes e a mesma regra do traço da mesa do inspetor no computador. Os
  // outros (o responsável, por exemplo) seguem com os números do prédio.
  const meuMes = useMeuMes(user?.id, buildingId, agenda.month, agenda.year, { enabled: podeVistoriar });
  const meusPendentes = useMySchedules(
    { building_id: buildingId, status: 'PENDENTE' },
    { enabled: podeVistoriar && !!buildingId }
  );
  const meusNumeros = useMemo(
    () => numerosDoMes(meuMes.data?.inspections ?? [], meuMes.data?.total ?? 0),
    [meuMes.data]
  );
  // Erro (ou página incompleta) vira traço, e não zero: zero seria uma afirmação.
  const traco = (erro, v) => (erro || v === null || v === undefined ? '—' : v);
  const pendentes = (meusPendentes.data?.schedules ?? []).filter((s) => (s.status ?? 'PENDENTE') === 'PENDENTE').length;
  const numerosDoCard = podeVistoriar
    ? [
        { value: meuMes.isLoading ? '…' : traco(meuMes.isError, meusNumeros.vistorias), label: 'Minhas vistorias' },
        { value: meuMes.isLoading ? '…' : traco(meuMes.isError, meusNumeros.andares), label: 'Andares' },
        { value: meusPendentes.isLoading ? '…' : traco(meusPendentes.isError, pendentes), label: 'Pendentes' },
      ]
    : [
        { value: stats.vistorias, label: 'Vistorias' },
        { value: stats.dias, label: 'Dias' },
        { value: stats.inspetores, label: 'Inspetores' },
      ];

  return (
    <RouteGuard>
      {/* A tela inicial é do telefone. No computador cada conta tem a sua
          (ver `destinoNoComputador`) — sem isto, quem chegava aqui por link ou
          pelo "voltar" via a tela de celular esticada no monitor inteiro. */}
      <SoNoCelular>
      <MPage>
        <MTopBar
          className="anim-fade-down"
          eyebrow={format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
          title="Olá,"
          accent={user?.name?.split(' ')[0]}
          avatar={
            <button
              onClick={() => router.push('/perfil')}
              aria-label="Abrir perfil"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, borderRadius: '50%' }}
            >
              <Avatar user={user} size={44} />
            </button>
          }
          actions={
            <>
              {/* Só para quem atende chamado — para o resto seria um sino que
                  nunca toca (ver NotificacaoChamados). */}
              <NotificacaoChamados />
              {/* O sino geral: agendamentos criados, alterados, perto do prazo —
                  só do prédio escolhido. O aviso leva ao dia dele no calendário
                  logo abaixo. */}
              <NotificacoesSino buildingId={buildingId} enabled={!!buildingId} onOpenSchedule={(payload, aviso) => agenda.abrirAgendamento(payload, aviso)} />
              <MRound label="Histórico" onClick={() => router.push('/historico')}>
                <ClipboardList size={18} />
              </MRound>
            </>
          }
        />

        {podeVistoriar && (
          <MCard className="anim-fade-up anim-d1"
            style={{ background: M.accent, boxShadow: `inset 0 0 0 1px ${M.accentEdge}`, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}
            onClick={() => router.push('/inspecao')}>
            <div style={{ width: 46, height: 46, borderRadius: R.control, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardCheck size={22} color="#000" />
            </div>
            <div>
              <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 17, color: '#000' }}>Nova vistoria</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.6)', marginTop: 2 }}>Andar por andar, do topo ao subsolo</p>
            </div>
          </MCard>
        )}

        {!buildingsLoading && !hasBuilding && (
          <MCard className="anim-fade-up anim-d1" style={{ marginTop: 12, padding: '28px 20px' }}>
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text, textAlign: 'center' }}>
              Nenhum prédio ainda
            </p>
            <p style={{ color: M.mute, fontSize: 14, marginTop: 6, marginBottom: 18, lineHeight: 1.6, textAlign: 'center' }}>
              Peça a chave ao gestor do prédio e digite abaixo para se conectar.
            </p>
            <JoinBuildingForm />
          </MCard>
        )}

        {!buildingsLoading && hasBuilding && (
          <>
            <MSectionHead
              className="anim-fade-up anim-d2"
              title={hasChoice ? 'Prédio' : myBuildings[0]?.name ?? 'Seu prédio'}
              action={
                <BuildingSwitcher
                  buildings={myBuildings}
                  buildingId={buildingId}
                  onChange={setActive}
                />
              }
            />

            <MCard className="anim-fade-up anim-d3" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MStats items={numerosDoCard} />

              <div>
                {/* A grade avança sobre o respiro do cartão: a 360px, com os
                    18px de cada lado, a célula ficava com ~38px de largura.
                    Com 4px de borda e o vão de 2px do compacto, cabe 44. */}
                <div style={{ margin: '0 -14px' }}>
                {agenda.calendarLoading && agenda.isLoading ? (
                  <Skeleton style={{ height: 340, width: '100%' }} />
                ) : (
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
                )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <LegendaDoInspetor colegas={agenda.predioTodo} />
                </div>
                {agenda.isError && (
                  <p role="alert" style={{ color: M.mute, fontSize: 12, marginTop: 10 }}>
                    Não foi possível carregar seus agendamentos.{' '}
                    <button
                      type="button"
                      className="link-acao link-acao--acento"
                      onClick={() => agenda.refetch()}
                      style={{ color: M.accentInk, fontSize: 12, minHeight: 44, padding: '0 2px' }}
                    >
                      Tentar de novo
                    </button>
                  </p>
                )}
                <p style={{ color: M.faint, fontSize: 12, marginTop: 10 }}>
                  Toque num dia marcado para ver a agenda ou as vistorias feitas
                </p>
              </div>
            </MCard>
          </>
        )}

        <AgendaDoInspetorModais agenda={agenda} />

        <BottomNav />
      </MPage>
      </SoNoCelular>
    </RouteGuard>
  );
}
