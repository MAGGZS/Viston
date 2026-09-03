'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Building2, Eye } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { MenuDaConta } from '@/app/components/MenuDaConta';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { Logo } from '@/app/components/Logo';
import { CalendarHeatmap } from '@/app/components/CalendarHeatmap';
import { DayInspectionsModal } from '@/app/components/DayInspectionsModal';
import { InspectionPreviewModal } from '@/app/components/InspectionPreview';
import { Badge, Skeleton } from '@/app/components/ui';
import { useCalendar, useBuildingHistory } from '@/app/hooks/useApi';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { useExcelDownload } from '@/app/hooks/useExcelDownload';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import { Paginator } from '@/app/components/Paginator';
import { parseReportDate } from '@/app/lib/date';
import { CELL_PAD_Y, placeholderCellHeight } from '@/app/lib/pagination';
import { useAuthStore } from '@/app/store/auth';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { HEAT, T } from '@/app/lib/theme';

// A célula de espera tem a altura da de verdade — o `Badge` da coluna de status
// entre os recuos da `.cell-y`, gêmea de `CELL_PAD_Y` (ver
// app/lib/pagination.js) —, para o cartão não encolher a cada seta.
const PLACEHOLDER_CELL_H = placeholderCellHeight({ padY: CELL_PAD_Y });

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada', COMPLETED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success', COMPLETED: 'success' };

function NoPredioState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
      <Building2 size={48} className="anim-pop-in text-chip mb-4" />
      <p className="anim-fade-up anim-d1 text-ink font-semibold text-lg">Você não tem ligação a nenhum prédio</p>
      <p className="anim-fade-up anim-d2 text-mute text-sm mt-2 mb-6">Peça a chave ao gestor do prédio e digite abaixo para se conectar.</p>
      <div className="anim-fade-up anim-d3" style={{ width: '100%', maxWidth: 380 }}>
        <JoinBuildingForm />
      </div>
    </div>
  );
}

export default function VisualizacaoPage() {
  const { download, pendingId } = useExcelDownload();
  const { user } = useAuthStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dayModal, setDayModal] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  // Com dois vínculos, quem escolhe é a pessoa: antes esta tela mostrava só o
  // primeiro prédio da lista, sem seletor e sem dizer que havia outro.
  const {
    buildings: myBuildings,
    active: activeBuilding,
    buildingId,
    setActive: setActiveBuilding,
    isLoading: buildingsLoading,
  } = useActiveBuilding();
  const hasBuilding = myBuildings.length > 0;

  const { data: calData, isLoading: calLoading } = useCalendar(
    hasBuilding ? { month, year, building_id: buildingId } : null
  );
  // Oito por página: quem anda pelo resto é o rodapé de setas do cartão.
  const vistorias = useBuildingHistory(hasBuilding ? buildingId : null);
  // Enquanto a próxima página não chega, a que está saindo deixa a tela: o que
  // se vê é esqueleto, e não uma lista velha passando por nova (ver
  // `usePagedList`).
  const rows = vistorias.isPaging ? [] : vistorias.rows;
  const inspLoading = vistorias.isLoading;

  function prev() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <RouteGuard roles={['INSPECTOR', 'VIEWER', 'NONE']}>
      <div className="hidden lg:flex flex-col min-h-screen bg-page">
        {/* Header */}
        {/*
          `position: relative` e `zIndex` para o menu da conta poder sair daqui.

          O `anim-fade-down` termina em `transform: translateY(0)` com
          `animation-fill-mode: both` — e transform, mesmo o identidade, cria
          contexto de empilhamento. O `z-index: 60` do menu passava a valer só
          dentro do cabeçalho, e o cabeçalho, sem posição, disputava com o
          `<main>` em pé de igualdade: os cartões do miolo vêm depois no
          documento e ganhavam o desempate. O menu abria atrás da lista de
          vistorias.

          Posicionado e com z-index próprio, o cabeçalho inteiro sobe — e o que
          ele abrir sobe junto.
        */}
        <header className="anim-fade-down" style={{ position: 'relative', zIndex: 30, height: 60, background: T.bg, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
          <Logo size={18} variant="horizontal" />
          {/* A foto era um atalho para o perfil, e só. Nesta tela não há barra
              lateral, então sair exigia abrir o perfil para achar o botão lá
              dentro, e trocar o tema exigia o mesmo desvio — duas telas para
              dois gestos de um toque. */}
          <MenuDaConta user={user} />
        </header>

        {/* Main */}
        <main id={CONTENT_ID} className="flex-1 px-6 py-8 overflow-auto flex flex-col">
          <div className="anim-fade-up mb-8">
            <h1 className="text-2xl font-semibold text-ink">
              Olá, <span style={{ color: T.accentInk }}>{user?.name ?? ''}</span>
            </h1>
            <p className="text-mute text-sm mt-1">Fique por dentro de como anda a estrutura do prédio</p>
          </div>

          {buildingsLoading ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-1 h-64 bg-card rounded-card animate-pulse" />
              <div className="col-span-2 h-64 bg-card rounded-card animate-pulse" />
            </div>
          ) : !hasBuilding ? (
            <NoPredioState />
          ) : (
            /* `items-start`: o calendário tem altura própria, das semanas do
               mês. Esticado até a altura da tabela ao lado, ele virava um
               cartão com um vão vazio embaixo da legenda. */
            <div className="grid grid-cols-3 gap-6 items-start">
              {/* Calendário heatmap */}
              <div className="anim-fade-up anim-d1 col-span-1 bg-card rounded-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prev} aria-label="Mês anterior" className="p-1 text-mute hover:text-ink transition-transform duration-150 hover:-translate-x-0.5"><ChevronLeft size={18} /></button>
                  {/* `key` no mês: a troca reanima o rótulo, então o clique tem resposta visível */}
                  <span key={monthLabel} className="anim-fade-in text-ink text-sm font-semibold capitalize">{monthLabel}</span>
                  <button onClick={next} aria-label="Próximo mês" className="p-1 text-mute hover:text-ink transition-transform duration-150 hover:translate-x-0.5"><ChevronRight size={18} /></button>
                </div>
                {calLoading ? <Skeleton className="h-48 w-full" /> : (
                  <CalendarHeatmap heatmap={calData?.heatmap ?? {}} month={month} year={year}
                    onDayClick={(day, info) => setDayModal({ day, info })} />
                )}
                <div className="flex items-center gap-1 mt-3 justify-end">
                  <span className="text-mute text-xs">Menos</span>
                  {HEAT.map((c, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
                  ))}
                  <span className="text-mute text-xs">Mais</span>
                </div>
              </div>

              {/* Tabela de inspeções */}
              <div className="anim-fade-up anim-d2 col-span-2 bg-card rounded-card overflow-hidden">
                <div className="px-6 py-4 border-b border-line flex items-center justify-between gap-4">
                  <h2 className="text-ink font-semibold">
                    Inspeções Recentes{myBuildings.length > 1 ? '' : ` — ${activeBuilding?.name ?? ''}`}
                  </h2>
                  <BuildingSwitcher
                    buildings={myBuildings}
                    buildingId={buildingId}
                    onChange={setActiveBuilding}
                  />
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line">
                      {['Inspetor', 'Status', 'Dia', 'Excel'].map((h) => (
                        <th key={h} className="text-left px-6 py-3 text-mute text-xs font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  {/* `key` na página: as linhas entram de novo a cada seta. */}
                  <tbody key={vistorias.page}>
                    {vistorias.placeholders.map((i) => (
                      <tr key={i} className="border-b border-line">
                        {[1, 2, 3, 4].map((j) => (
                          <td key={j} className="px-6 cell-y" style={{ height: PLACEHOLDER_CELL_H }}>
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.map((r, idx) => (
                      <tr key={r.id} className={`anim-fade-in anim-d${Math.min(idx + 1, 6)} border-b border-line hover:bg-chip transition-colors`}>
                        <td className="px-6 cell-y text-ink text-sm">{r.inspector?.name ?? '—'}</td>
                        <td className="px-6 cell-y">
                          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </td>
                        {/* Só o dia: a planilha e o relatório completo passaram
                            a ser do dia, e a hora do envio não dizia nada. */}
                        <td className="px-6 cell-y text-mute text-sm">
                          {format(parseReportDate(r.date), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-6 cell-y">
                          <div className="flex items-center gap-4">
                            {r.has_excel ? (
                              <button type="button" onClick={() => download(r.id)} disabled={pendingId === r.id}
                                className="flex items-center gap-1 text-accent-ink text-sm hover:underline disabled:opacity-50">
                                <Download size={13} /> Baixar
                              </button>
                            ) : <span className="text-mute text-sm">—</span>}
                            <button onClick={() => setPreviewId(r.id)}
                              className="flex items-center gap-1 text-mute text-sm hover:text-ink transition-all duration-150 active:scale-95">
                              <Eye size={13} /> Prévia
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!inspLoading && !vistorias.isPaging && rows.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-mute text-sm">Nenhuma inspeção encontrada</td></tr>
                    )}
                  </tbody>
                </table>
                <Paginator
                  page={vistorias.page}
                  pages={vistorias.pages}
                  total={vistorias.total}
                  count={vistorias.rows.length}
                  pageSize={vistorias.pageSize}
                  onPrev={vistorias.prev}
                  onNext={vistorias.next}
                  isFetching={vistorias.isFetching}
                  className="border-t border-line"
                  style={{ padding: '12px 24px' }}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile fallback */}
      <div className="lg:hidden flex items-center justify-center min-h-screen bg-page p-6 text-center">
        <div>
          <p className="text-4xl mb-4">📱</p>
          <p className="text-ink font-semibold text-lg">Use o app mobile</p>
          <p className="text-mute text-sm mt-2">Esta visualização é otimizada para desktop</p>
        </div>
      </div>

      <DayInspectionsModal
        open={!!dayModal}
        onClose={() => setDayModal(null)}
        day={dayModal?.day}
        info={dayModal?.info}
      />

      <InspectionPreviewModal open={!!previewId} onClose={() => setPreviewId(null)} reportId={previewId} />
    </RouteGuard>
  );
}
