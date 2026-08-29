'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Avatar } from '@/app/components/Avatar';
import { BottomNav } from '@/app/components/BottomNav';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { NotificacaoChamados } from '@/app/components/NotificacaoChamados';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import { Skeleton } from '@/app/components/ui';
import { M, MPage, MTopBar, MRound, MCard, MStats, MSectionHead } from '@/app/components/mobile/kit';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { useAuthStore } from '@/app/store/auth';
import { useCalendar } from '@/app/hooks/useApi';
import { canInspect } from '@/app/lib/roles';
import { R } from '@/app/lib/theme';

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);

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

  const { data, isLoading } = useCalendar(
    hasBuilding ? { month, year, building_id: buildingId } : null,
  );

  const heatmap = data?.heatmap ?? {};

  // Números do mês, direto do calendário
  const stats = useMemo(() => {
    const days = Object.values(heatmap);
    const vistorias = days.reduce((sum, d) => sum + (d.count ?? 0), 0);
    const inspetores = new Set(days.flatMap((d) => d.inspectors ?? [])).size;
    return { vistorias, dias: days.length, inspetores };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // Vistoriar é permissão do prédio, não da conta: quem só acompanha este aqui
  // não vê o botão, mesmo que vistorie outro.
  const podeVistoriar = canInspect(user, buildingId);
  const monthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard>
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
              <MRound label="Histórico" onClick={() => router.push('/historico')}>
                <ClipboardList size={18} />
              </MRound>
            </>
          }
        />

        {podeVistoriar && (
          <MCard className="anim-fade-up anim-d1"
            style={{ background: M.accent, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}
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
              <MStats items={[
                { value: stats.vistorias, label: 'Vistorias' },
                { value: stats.dias, label: 'Dias' },
                { value: stats.inspetores, label: 'Inspetores' },
              ]} />

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button onClick={prevMonth} aria-label="Mês anterior" style={{ background: 'none', border: 'none', cursor: 'pointer', color: M.faint, padding: 4 }}>
                    <ChevronLeft size={18} />
                  </button>
                  <span key={monthLabel} className="anim-fade-in" style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.text, textTransform: 'capitalize' }}>{monthLabel}</span>
                  <button onClick={nextMonth} aria-label="Próximo mês" style={{ background: 'none', border: 'none', cursor: 'pointer', color: M.faint, padding: 4 }}>
                    <ChevronRight size={18} />
                  </button>
                </div>

                {isLoading ? <Skeleton style={{ height: 192, width: '100%' }} /> : (
                  <CalendarHeatmap heatmap={heatmap} month={month} year={year} onDayClick={(day, info) => setDayModal({ day, info })} />
                )}

                <p style={{ color: M.faint, fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                  Toque num dia com marca para ver o relatório
                </p>
              </div>
            </MCard>
          </>
        )}

        <DayInspectionsModal
          open={!!dayModal}
          onClose={() => setDayModal(null)}
          day={dayModal?.day}
          info={dayModal?.info}
        />

        <BottomNav />
      </MPage>
    </RouteGuard>
  );
}
