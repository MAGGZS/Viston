'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Sheet, Search, Filter } from 'lucide-react';
import api from '@/lib/api';
import { Avatar, StatusBadge, Spinner, EmptyState } from '@/components/ui';
import { ClipboardList } from 'lucide-react';

export default function AdminHistoricoPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ inspectorId: '', startDate: '', endDate: '' });

  const params = new URLSearchParams({ page, limit: 20 });
  if (filters.inspectorId) params.set('inspectorId', filters.inspectorId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-inspections', page, filters],
    queryFn: () => api.get(`/inspections?${params}`).then((r) => r.data),
    keepPreviousData: true,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6">Histórico de Relatórios</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filters.inspectorId}
          onChange={(e) => { setFilters((f) => ({ ...f, inspectorId: e.target.value })); setPage(1); }}
          className="input w-auto min-w-[180px]"
        >
          <option value="">Todos os inspetores</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => { setFilters((f) => ({ ...f, startDate: e.target.value })); setPage(1); }}
          className="input w-auto"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => { setFilters((f) => ({ ...f, endDate: e.target.value })); setPage(1); }}
          className="input w-auto"
        />
        <button
          onClick={() => { setFilters({ inspectorId: '', startDate: '', endDate: '' }); setPage(1); }}
          className="btn-secondary px-4 py-2 text-sm"
        >
          Limpar
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : !data?.data?.length ? (
        <EmptyState icon={ClipboardList} title="Nenhum relatório encontrado" />
      ) : (
        <div className="bg-bg-secondary rounded-2xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-text-secondary">
                <th className="text-left px-5 py-3 font-semibold">Data</th>
                <th className="text-left px-5 py-3 font-semibold">Inspetor</th>
                <th className="text-left px-5 py-3 font-semibold">Andares</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((report) => (
                <tr key={report.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 text-text-secondary whitespace-nowrap">
                    {format(new Date(report.date), "dd/MM/yyyy", { locale: ptBR })}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={report.inspector.name} url={report.inspector.avatarUrl} size="sm" />
                      <span>{report.inspector.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {report.floorEntries?.slice(0, 4).map((e) => (
                        <span key={e.id} className="badge bg-white/10 text-text-secondary text-[10px]">
                          {e.floor.label}
                        </span>
                      ))}
                      {report.floorEntries?.length > 4 && (
                        <span className="badge bg-white/10 text-text-secondary text-[10px]">
                          +{report.floorEntries.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={report.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 justify-center">
                      {report.pdfUrl && (
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/inspections/${report.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:opacity-80"
                          title="Baixar PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      )}
                      {report.excelUrl && (
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/inspections/${report.id}/excel`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:opacity-80"
                          title="Baixar Excel"
                        >
                          <Sheet className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
            Anterior
          </button>
          <span className="flex items-center text-sm text-text-secondary">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary px-4 py-2 text-sm disabled:opacity-40">
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
