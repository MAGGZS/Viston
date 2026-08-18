'use client';
import { useState, useMemo } from 'react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { CalendarDayCell } from '@/app/components/CalendarDayCell';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { ReportDocumentModal } from '@/app/components/ReportDocumentModal';
import { M, MPage, MTopBar, MRound, MCard, MButtonGhost } from '@/app/components/mobile/kit';
import { Badge, Button, Modal } from '@/app/components/ui';
import { useInspections, useCalendar, useMyBuildings, useBuildingHistory } from '@/app/hooks/useApi';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { parseReportDate } from '@/app/lib/date';
import { useAuthStore } from '@/app/store/auth';

const S = {
  page: { minHeight: '100vh', background: '#0B0B0B' },
  label: { fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.44)' },
  input: { background: '#232323', border: 'none', borderRadius: 16, padding: '11px 14px', color: 'rgba(255,255,255,0.96)', fontSize: 14, outline: 'none', width: '100%' },
};

function NoPredioState({ isMobile }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '80px 0' : '120px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 40, marginBottom: 16 }}>🏢</p>
      <p style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Você não tem ligação a nenhum prédio</p>
      <p style={{ color: 'rgba(255,255,255,0.26)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>Peça a chave ao gestor do prédio e digite abaixo para se conectar.</p>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <JoinBuildingForm />
      </div>
    </div>
  );
}

const DAYS_LABEL = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function heatColor(count) {
  if (!count) return '#232323';
  if (count === 1) return '#2E2A12';
  if (count === 2) return '#6B5A00';
  if (count === 3) return '#A88A00';
  return '#F5C518';
}

function MonthGrid({ heatmap, year, month, onDayClick, compact = false }) {
  const days = eachDayOfInterval({ start: startOfMonth(new Date(year, month - 1)), end: endOfMonth(new Date(year, month - 1)) });
  const blanks = Array(days[0].getDay()).fill(null);
  const size = compact ? 18 : 28;
  const gap = compact ? 3 : 4;
  return (
    <div>
      {!compact && (
        <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'capitalize' }}>
          {format(new Date(year, month - 1), 'MMMM', { locale: ptBR })}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap, marginBottom: gap }}>
        {DAYS_LABEL.map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.26)' }}>{d}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap }}>
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const info = heatmap?.[key];
          return (
            <CalendarDayCell
              key={key}
              dayNumber={format(d, 'd')}
              dayKey={key}
              info={info}
              background={heatColor(info?.count)}
              size={size}
              onClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}

// Clicar no card abre o relatório completo da vistoria
function InspectionCard({ inspection, onPreview, onOpenReport, className = '' }) {
  const totalRecords = inspection.floor_form_entries?.reduce(
    (sum, e) => sum + (e._count?.maintenance_records ?? 0), 0
  ) ?? 0;

  return (
    <div
      onClick={() => onOpenReport(inspection.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpenReport(inspection.id)}
      className={className}
      style={{ background: M.card, borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = M.chip; }}
      onMouseLeave={e => { e.currentTarget.style.background = M.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 14 }}>
            {format(parseReportDate(inspection.date), "d 'de' MMMM yyyy", { locale: ptBR })}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.44)', fontSize: 12, marginTop: 2 }}>
            {inspection.inspector?.name} · {totalRecords} ocorrência{totalRecords !== 1 ? 's' : ''}
          </p>
        </div>
        <ChevronRight size={18} color="rgba(255,255,255,0.26)" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {inspection.floor_form_entries?.map(e => (
          <Badge key={e.floor_id} variant={e.status_geral === 'OK' ? 'success' : e.status_geral === 'ATENCAO' ? 'warning' : 'danger'}>
            {e.floor?.label || e.floor_id.slice(0, 6)}
          </Badge>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {inspection.excel_url && (
          <a href={inspection.excel_url} target="_blank" rel="noreferrer" style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
            <Button variant="secondary" style={{ width: '100%', fontSize: 12, padding: '8px 12px' }}>
              <FileSpreadsheet size={13} /> Baixar planilha
            </Button>
          </a>
        )}
        {onPreview && (
          <Button variant="secondary" style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
            onClick={e => { e.stopPropagation(); onPreview(inspection.id); }}>
            <Eye size={13} /> Prévia
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Cartão do mobile — mesma leitura do desktop: data, quem assinou e quantas
 * ocorrências, depois os andares como etiquetas.
 *
 * Os três números grandes saíram: dois deles (andares e ocorrências) já estavam
 * na linha de baixo e nas etiquetas, e o bloco empurrava para fora da tela a
 * lista que a pessoa veio ver. A planilha virou ícone à direita pelo mesmo
 * motivo — um botão de largura inteira por cartão dominava a rolagem.
 */
function MobileInspectionCard({ inspection, onOpenReport, className = '' }) {
  const entries = inspection.floor_form_entries ?? [];
  const ocorrencias = entries.reduce((sum, e) => sum + (e._count?.maintenance_records ?? 0), 0);

  return (
    <MCard onClick={() => onOpenReport(inspection.id)} className={className} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.text, textTransform: 'capitalize' }}>
            {format(parseReportDate(inspection.date), "d 'de' MMMM yyyy", { locale: ptBR })}
          </p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>
            {inspection.inspector?.name} · {ocorrencias} ocorrência{ocorrencias !== 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {inspection.excel_url && (
            <a
              href={inspection.excel_url}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              aria-label="Baixar planilha"
              title="Baixar planilha"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 12,
                background: M.chip, color: M.accent, flexShrink: 0,
              }}
            >
              <Download size={16} />
            </a>
          )}
          <ChevronRight size={18} color={M.faint} />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {entries.map(e => (
          <Badge key={e.floor_id} variant={e.status_geral === 'OK' ? 'success' : e.status_geral === 'ATENCAO' ? 'warning' : 'danger'}>
            {e.floor?.label || e.floor_id.slice(0, 6)}
          </Badge>
        ))}
      </div>
    </MCard>
  );
}

export default function HistoricoPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const isDesktop = useIsDesktop();

  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [reportId, setReportId] = useState(null);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [calMode, setCalMode] = useState('Mensal');
  const MODES = ['Mensal', 'Semestral', 'Anual'];

  const calParams = useMemo(() => calMode === 'Mensal' ? { month, year } : { year }, [calMode, month, year]);
  const { data: calData, isLoading: calLoading } = useCalendar(calParams);
  const heatmap = calData?.heatmap ?? {};

  const calMonths = useMemo(() => {
    if (calMode === 'Mensal') return [month];
    if (calMode === 'Semestral') { const s = month <= 6 ? 1 : 7; return Array.from({ length: 6 }, (_, i) => s + i); }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [calMode, month]);

  const navLabel = calMode === 'Mensal'
    ? format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR })
    : calMode === 'Semestral' ? `${month <= 6 ? '1º' : '2º'} semestre ${year}` : `${year}`;

  function prevCal() {
    if (calMode === 'Mensal') { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
    else setYear(y => y - 1);
  }
  function nextCal() {
    if (calMode === 'Mensal') { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }
    else setYear(y => y + 1);
  }

  const [filters, setFilters] = useState({ date_from: '', date_to: '' });

  // Prédios do usuário (para mobile)
  const { data: myBuildings = [], isLoading: buildingsLoading } = useMyBuildings();
  const hasBuilding = myBuildings.length > 0;
  const myBuildingId = myBuildings[0]?.building_id;

  // Desktop: todas as inspeções (admin vê tudo)
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInspections(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  );

  // Mobile: histórico do prédio vinculado
  const { data: buildingData, isLoading: buildingLoading, fetchNextPage: buildingFetchNext, hasNextPage: buildingHasNext, isFetchingNextPage: buildingFetchingNext } = useBuildingHistory(
    hasBuilding ? myBuildingId : null
  );

  const allInspections = data?.pages?.flatMap(p => p.inspections) || [];
  const buildingInspections = buildingData?.pages?.flatMap(p => p.inspections) || [];

  const listaPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(isAdmin ? isLoading : buildingLoading) && [1, 2, 3].map(i => <div key={i} style={{ height: 120, background: '#232323', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />)}
      {!(isAdmin ? isLoading : buildingLoading) && (isAdmin ? allInspections : buildingInspections).length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p className="anim-pop-in" style={{ fontSize: 36, marginBottom: 12 }}>📋</p>
          <p className="anim-fade-up anim-d1" style={{ color: 'rgba(255,255,255,0.26)', fontSize: 14 }}>Nenhuma inspeção encontrada</p>
        </div>
      )}
      {(isAdmin ? allInspections : buildingInspections).map((i, idx) => (
        <InspectionCard
          key={i.id}
          inspection={i}
          onPreview={setPreviewId}
          onOpenReport={setReportId}
          className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
        />
      ))}
      {(isAdmin ? hasNextPage : buildingHasNext) && (
        <Button variant="secondary" style={{ width: '100%' }} onClick={() => isAdmin ? fetchNextPage() : buildingFetchNext()} loading={isAdmin ? isFetchingNextPage : buildingFetchingNext}>Carregar mais</Button>
      )}
    </div>
  );

  const calendarioPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevCal} style={{ background: '#232323', borderRadius: 10, padding: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.44)', display: 'flex' }}><ChevronLeft size={16} /></button>
          <span key={navLabel} className="anim-fade-in" style={{ color: 'rgba(255,255,255,0.96)', fontWeight: 600, fontSize: 14, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>{navLabel}</span>
          <button onClick={nextCal} style={{ background: '#232323', borderRadius: 10, padding: 6, cursor: 'pointer', color: 'rgba(255,255,255,0.44)', display: 'flex' }}><ChevronRight size={16} /></button>
        </div>
        <div style={{ display: 'flex', background: '#232323', borderRadius: 12, padding: 3, gap: 2 }}>
          {MODES.map(m => (
            <button key={m} onClick={() => setCalMode(m)} style={{ padding: '5px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: calMode === m ? '#F5C518' : 'transparent', color: calMode === m ? '#000' : 'rgba(255,255,255,0.44)', transition: 'all 0.2s' }}>{m}</button>
          ))}
        </div>
      </div>
      {calLoading ? (
        <div style={{ height: 200, background: '#232323', borderRadius: 20, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: calMode === 'Mensal' ? '1fr' : calMode === 'Semestral' ? 'repeat(auto-fill, minmax(200px, 1fr))' : 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {calMonths.map(m => (
            <div key={m} style={{ background: '#232323', borderRadius: 26, padding: 16 }}>
              <MonthGrid heatmap={heatmap} year={year} month={m} onDayClick={(day, info) => setSelected({ day, info })} compact={calMode !== 'Mensal'} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255,255,255,0.26)', fontSize: 11 }}>Menos</span>
        {['#232323', '#2E2A12', '#6B5A00', '#A88A00', '#F5C518'].map((c, i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
        ))}
        <span style={{ color: 'rgba(255,255,255,0.26)', fontSize: 11 }}>Mais</span>
      </div>
    </div>
  );

  const desktopContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="anim-fade-down" style={{ padding: '32px 32px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ color: 'rgba(255,255,255,0.96)', fontSize: 22, fontWeight: 600 }}>Histórico</h1>
        {!isAdmin && hasBuilding && (
          <button onClick={() => setShowFilters(true)} style={{ width: 36, height: 36, background: '#232323', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.44)', cursor: 'pointer' }}>
            <SlidersHorizontal size={15} />
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setShowFilters(true)} style={{ width: 36, height: 36, background: '#232323', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.44)', cursor: 'pointer' }}>
            <SlidersHorizontal size={15} />
          </button>
        )}
      </div>
      {!isAdmin && !buildingsLoading && !hasBuilding ? (
        <div style={{ padding: '0 32px' }}><NoPredioState /></div>
      ) : (
        <div style={{ padding: '0 32px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, overflowY: 'auto' }}>
          <div className="anim-fade-up anim-d1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={S.label}>Lista</p>
            {listaPanel}
          </div>
          <div className="anim-fade-up anim-d2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={S.label}>Calendário</p>
            {calendarioPanel}
          </div>
        </div>
      )}
    </div>
  );

  const mobileContent = (
    <MPage>
      <MTopBar
        className="anim-fade-down"
        eyebrow="Vistorias concluídas"
        title="Histórico"
        actions={hasBuilding ? (
          <MRound label="Filtros" onClick={() => setShowFilters(true)}>
            <SlidersHorizontal size={17} />
          </MRound>
        ) : null}
      />

      {buildingsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 128, background: M.card, borderRadius: 26 }} />)}
        </div>
      ) : !hasBuilding ? (
        <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>Nenhum prédio vinculado</p>
          <p style={{ color: M.mute, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            Peça a chave ao administrador e solicite acesso pelo perfil.
          </p>
        </MCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {buildingLoading && [1, 2, 3].map(i => <div key={i} style={{ height: 128, background: M.card, borderRadius: 26 }} />)}

          {!buildingLoading && buildingInspections.length === 0 && (
            <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: M.mute, fontSize: 14 }}>Nenhuma vistoria por aqui ainda</p>
            </MCard>
          )}

          {buildingInspections.map((i, idx) => (
            <MobileInspectionCard
              key={i.id}
              inspection={i}
              onOpenReport={setReportId}
              className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
            />
          ))}

          {buildingHasNext && (
            <MButtonGhost onClick={() => buildingFetchNext()} disabled={buildingFetchingNext} style={{ width: '100%' }}>
              {buildingFetchingNext ? 'Carregando...' : 'Carregar mais'}
            </MButtonGhost>
          )}
        </div>
      )}
    </MPage>
  );

  return (
    <RouteGuard>
      <div style={S.page}>
        {isDesktop ? (
          isAdmin ? (
            <div style={{ display: 'flex', minHeight: '100vh' }}>
              <AdminSidebar />
              <main style={{ flex: 1, overflowY: 'auto' }}>{desktopContent}</main>
            </div>
          ) : (
            desktopContent
          )
        ) : (
          <div style={{ paddingBottom: 100 }}>
            {mobileContent}
          </div>
        )}

        <Modal open={showFilters} onClose={() => setShowFilters(false)} title="Filtros">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[['Data inicial', 'date_from'], ['Data final', 'date_to']].map(([lbl, key]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={S.label}>{lbl}</label>
                <input type="date" style={S.input} value={filters[key]} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setFilters({ date_from: '', date_to: '' }); setShowFilters(false); }}>Limpar</Button>
              <Button style={{ flex: 1 }} onClick={() => setShowFilters(false)}>Aplicar</Button>
            </div>
          </div>
        </Modal>

        <DayInspectionsModal
          open={!!selected}
          onClose={() => setSelected(null)}
          day={selected?.day}
          info={selected?.info}
        />

        <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />

        <ReportDocumentModal open={!!reportId} onClose={() => setReportId(null)} reportId={reportId} />

        {!isDesktop && <BottomNav />}
      </div>
    </RouteGuard>
  );
}
