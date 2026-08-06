'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { Button, Card, Modal, Skeleton } from '@/app/components/ui';
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

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const canInspect = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';
  const monthLabel = format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard>
      <div style={{ minHeight: '100vh', background: '#080810', paddingBottom: 100 }}>

        {/* Header */}
        <div className="anim-fade-down" style={{ padding: '56px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textTransform: 'capitalize' }}>
                {format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
              <h1 style={{ color: 'rgba(255,255,255,0.95)', fontSize: 24, fontWeight: 700, marginTop: 4 }}>
                Olá, {user?.name?.split(' ')[0]} 👋
              </h1>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#F5C518', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(245,197,24,0.3)' }}>
              <span style={{ color: '#000', fontWeight: 700, fontSize: 18 }}>{user?.name?.[0]?.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* CTA */}
          {canInspect && (
            <button onClick={() => router.push('/inspecao')} className="anim-fade-up anim-d1 hover-glow" style={{ width: '100%', background: '#F5C518', color: '#000', borderRadius: 24, padding: 20, display: 'flex', alignItems: 'center', gap: 16, border: 'none', cursor: 'pointer', boxShadow: '0 0 30px rgba(245,197,24,0.2)', textAlign: 'left', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ width: 48, height: 48, background: 'rgba(0,0,0,0.15)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ClipboardCheck size={22} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16 }}>Fazer Inspeção</p>
                <p style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>Iniciar nova vistoria</p>
              </div>
            </button>
          )}

          {/* Calendário — só aparece se tiver vínculo com prédio */}
          {!buildingsLoading && hasBuilding && (
            <Card className="anim-fade-up anim-d2">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}><ChevronLeft size={18} /></button>
                <h2 style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabel}</h2>
                <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}><ChevronRight size={18} /></button>
              </div>
              {isLoading ? <Skeleton style={{ height: 192, width: '100%' }} /> : (
                <CalendarHeatmap heatmap={data?.heatmap || {}} month={month} year={year} onDayClick={(day, info) => setDayModal({ day, info })} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, justifyContent: 'flex-end' }}>
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>Menos</span>
                {['rgba(255,255,255,0.05)', 'rgba(245,197,24,0.15)', 'rgba(245,197,24,0.35)', 'rgba(245,197,24,0.6)', '#F5C518'].map((c, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                ))}
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>Mais</span>
              </div>
            </Card>
          )}
        </div>

        <Modal open={!!dayModal} onClose={() => setDayModal(null)} title={dayModal?.day}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 }}>{dayModal?.info?.count} inspeção(ões) realizada(s)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {dayModal?.info?.inspectors?.map((name, i) => (
              <span key={i} style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)' }}>{name}</span>
            ))}
          </div>
          <Button variant="secondary" style={{ width: '100%' }} onClick={() => { router.push(`/historico?date_from=${dayModal?.day}&date_to=${dayModal?.day}`); setDayModal(null); }}>
            Ver relatórios do dia
          </Button>
        </Modal>

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
