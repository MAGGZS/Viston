'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { Skeleton } from '@/app/components/ui';
import { M, MPage, MTopBar, MRound, MCard, MStats, MButton, MSectionHead } from '@/app/components/mobile/kit';
import { useAuthStore } from '@/app/store/auth';
import { useCalendar, useMyBuildings } from '@/app/hooks/useApi';

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);

  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const buildingId = myBuildings[0]?.id;

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

  const canInspect = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';
  const monthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard>
      <MPage>
        <MTopBar
          eyebrow={format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
          title="Olá,"
          accent={user?.name?.split(' ')[0]}
          avatar={
            <button onClick={() => router.push('/perfil')} aria-label="Abrir perfil" style={{
              width: 44, height: 44, borderRadius: '50%', background: M.accent, border: 'none', cursor: 'pointer',
              fontFamily: M.display, fontWeight: 600, fontSize: 18, color: '#000', flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </button>
          }
          actions={
            <MRound label="Histórico" onClick={() => router.push('/historico')}>
              <ClipboardList size={18} />
            </MRound>
          }
        />

        {canInspect && (
          <MCard style={{ background: M.accent, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}
            onClick={() => router.push('/inspecao')}>
            <div style={{ width: 46, height: 46, borderRadius: 16, background: 'rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ClipboardCheck size={22} color="#000" />
            </div>
            <div>
              <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 17, color: '#000' }}>Nova vistoria</p>
              <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)', marginTop: 2 }}>Andar por andar, do topo ao subsolo</p>
            </div>
          </MCard>
        )}

        {!buildingsLoading && !hasBuilding && (
          <MCard style={{ marginTop: 12, textAlign: 'center', padding: '32px 20px' }}>
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>Nenhum prédio ainda</p>
            <p style={{ color: M.mute, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              Peça a chave ao administrador e solicite acesso pelo perfil.
            </p>
            <MButton onClick={() => router.push('/perfil')} style={{ marginTop: 16 }}>Ir para o perfil</MButton>
          </MCard>
        )}

        {!buildingsLoading && hasBuilding && (
          <>
            <MSectionHead title={myBuildings[0]?.name ?? 'Seu prédio'} />

            <MCard style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <span style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.text, textTransform: 'capitalize' }}>{monthLabel}</span>
                  <button onClick={nextMonth} aria-label="Próximo mês" style={{ background: 'none', border: 'none', cursor: 'pointer', color: M.faint, padding: 4 }}>
                    <ChevronRight size={18} />
                  </button>
                </div>

                {isLoading ? <Skeleton style={{ height: 192, width: '100%' }} /> : (
                  <CalendarHeatmap heatmap={heatmap} month={month} year={year} onDayClick={(day, info) => setDayModal({ day, info })} />
                )}

                <p style={{ color: M.faint, fontSize: 11, marginTop: 12, textAlign: 'center' }}>
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
