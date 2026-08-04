'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, RefreshCw, Search } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { Button, Input, Badge, Skeleton, Select } from '@/app/components/ui';
import { useInspections, useSyncGoogleForm } from '@/app/hooks/useApi';

const STATUS_LABEL = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', FINISHED: 'Finalizada' };
const STATUS_VARIANT = { PENDING: 'default', IN_PROGRESS: 'accent', FINISHED: 'success' };

export default function AdminHistoricoPage() {
  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [applied, setApplied] = useState({});
  const syncGoogleForm = useSyncGoogleForm();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInspections(applied);
  const rows = data?.pages?.flatMap((p) => p.inspections) ?? [];

  function applyFilters() {
    setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
  }

  function clearFilters() {
    setFilters({ status: '', date_from: '', date_to: '' });
    setApplied({});
  }

  return (
    <RouteGuard roles={['ADMIN']}>
      <div className="hidden lg:flex min-h-screen bg-[#0D0D0D]">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Histórico de Inspeções</h1>

          {/* Filtros */}
          <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-5 mb-6 flex flex-wrap gap-4 items-end">
            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              options={[
                { value: '', label: 'Todos' },
                { value: 'PENDING', label: 'Pendente' },
                { value: 'IN_PROGRESS', label: 'Em andamento' },
                { value: 'FINISHED', label: 'Finalizada' },
              ]}
            />
            <Input
              label="De"
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            />
            <Input
              label="Até"
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button onClick={applyFilters}><Search size={16} /> Filtrar</Button>
              <Button variant="secondary" onClick={clearFilters}>Limpar</Button>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {['ID', 'Prédio', 'Inspetor', 'Status', 'Data', 'Excel', 'Ações'].map((h) => (
                    <th key={h} className="text-left px-6 py-4 text-[#9A9A9A] text-sm font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && [1, 2, 3, 5].map((i) => (
                  <tr key={i} className="border-b border-[#2A2A2A]">
                    {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#2A2A2A] hover:bg-[#1E1E1E] transition-colors">
                    <td className="px-6 py-4 text-[#9A9A9A] text-xs font-mono">{r.id.slice(0, 8)}…</td>
                    <td className="px-6 py-4 text-white text-sm">{r.building?.name ?? r.buildingId}</td>
                    <td className="px-6 py-4 text-white text-sm">{r.inspector?.name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </td>
                    <td className="px-6 py-4 text-[#9A9A9A] text-sm">
                      {format(new Date(r.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4">
                      {r.excelUrl ? (
                        <a href={r.excelUrl} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[#F5C518] text-sm hover:underline">
                          <Download size={14} /> Baixar
                        </a>
                      ) : (
                        <span className="text-[#9A9A9A] text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {r.status === 'FINISHED' && (
                        <button
                          onClick={() => syncGoogleForm.mutate(r.id)}
                          disabled={syncGoogleForm.isPending}
                          className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-white transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={13} /> Reenviar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#9A9A9A]">Nenhuma inspeção encontrada</td>
                  </tr>
                )}
              </tbody>
            </table>

            {hasNextPage && (
              <div className="px-6 py-4 border-t border-[#2A2A2A] flex justify-center">
                <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="lg:hidden flex items-center justify-center min-h-screen bg-[#0D0D0D] p-6 text-center">
        <div>
          <p className="text-4xl mb-4">🖥️</p>
          <p className="text-white font-bold text-lg">Painel Admin</p>
          <p className="text-[#9A9A9A] text-sm mt-2">Acesse pelo computador</p>
        </div>
      </div>
    </RouteGuard>
  );
}
