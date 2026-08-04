'use client';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileSpreadsheet, RefreshCw, Filter } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { StatusBadge, Badge, Button, Card, Skeleton, Modal } from '@/app/components/ui';
import { useInspections, useSyncGoogleForm } from '@/app/hooks/useApi';
import { useAuthStore } from '@/app/store/auth';

function InspectionCard({ inspection, onSync }) {
  const { user } = useAuthStore();
  const canSync = user?.role === 'ADMIN' || user?.role === 'INSPECTOR';

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white font-semibold">
            {format(new Date(inspection.date), "d 'de' MMMM yyyy", { locale: ptBR })}
          </p>
          <p className="text-[#9A9A9A] text-sm">{inspection.inspector?.name}</p>
        </div>
        <StatusBadge synced={inspection.google_form_synced} />
      </div>

      {/* Andares */}
      <div className="flex flex-wrap gap-1">
        {inspection.floor_form_entries?.map(e => (
          <Badge key={e.floor_id} variant={
            e.status_geral === 'OK' ? 'success' :
            e.status_geral === 'ATENCAO' ? 'warning' : 'danger'
          }>
            {e.floor?.label || e.floor_id.slice(0, 6)}
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        {inspection.excel_url && (
          <a href={inspection.excel_url} target="_blank" rel="noreferrer" className="flex-1">
            <Button variant="secondary" className="w-full text-sm py-2">
              <FileSpreadsheet size={16} /> Excel
            </Button>
          </a>
        )}
        {!inspection.google_form_synced && canSync && (
          <Button variant="secondary" className="flex-1 text-sm py-2" onClick={() => onSync(inspection.id)}>
            <RefreshCw size={16} /> Reenviar
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function HistoricoPage() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    google_form_synced: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInspections(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  );

  const { mutateAsync: syncForm, isPending: isSyncing } = useSyncGoogleForm();

  const allInspections = data?.pages?.flatMap(p => p.inspections) || [];

  async function handleSync(id) {
    try {
      await syncForm(id);
    } catch (e) {
      alert(e?.response?.data?.error?.message || 'Erro ao sincronizar');
    }
  }

  return (
    <RouteGuard>
      <div className="min-h-screen bg-[#0D0D0D] pb-24">
        <div className="px-5 pt-12 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Histórico</h1>
            <button onClick={() => setShowFilters(true)} className="text-[#9A9A9A] hover:text-[#F5C518]">
              <Filter size={22} />
            </button>
          </div>
        </div>

        <div className="px-5 flex flex-col gap-3">
          {isLoading && [1,2,3].map(i => <Skeleton key={i} className="h-36" />)}

          {!isLoading && allInspections.length === 0 && (
            <div className="text-center py-16 text-[#9A9A9A]">
              <p className="text-4xl mb-3">📋</p>
              <p>Nenhuma inspeção encontrada</p>
            </div>
          )}

          {allInspections.map(inspection => (
            <InspectionCard key={inspection.id} inspection={inspection} onSync={handleSync} />
          ))}

          {hasNextPage && (
            <Button variant="secondary" className="w-full" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              Carregar mais
            </Button>
          )}
        </div>

        {/* Modal de filtros */}
        <Modal open={showFilters} onClose={() => setShowFilters(false)} title="Filtros">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[#9A9A9A]">Data inicial</label>
              <input type="date" className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F5C518]"
                value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[#9A9A9A]">Data final</label>
              <input type="date" className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F5C518]"
                value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-[#9A9A9A]">Sync Google Forms</label>
              <select className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F5C518]"
                value={filters.google_form_synced} onChange={e => setFilters(f => ({ ...f, google_form_synced: e.target.value }))}>
                <option value="">Todos</option>
                <option value="true">Sincronizado</option>
                <option value="false">Pendente</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => { setFilters({ date_from: '', date_to: '', google_form_synced: '' }); setShowFilters(false); }}>
                Limpar
              </Button>
              <Button className="flex-1" onClick={() => setShowFilters(false)}>Aplicar</Button>
            </div>
          </div>
        </Modal>

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
