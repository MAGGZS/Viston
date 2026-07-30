'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Search } from 'lucide-react';
import { useInspections } from '@/hooks/useInspections';
import { useUsers } from '@/hooks/useUsers';
import { Avatar, Badge } from '@/components/ui/Card';
import { formatDate, STATUS_BG, STATUS_LABELS } from '@/lib/utils';

export default function AdminHistoricoPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({ inspectorId: '', startDate: '', endDate: '', page: 1 });
  const { data: users = [] } = useUsers();
  const { data, isLoading } = useInspections({ ...filters, limit: 25 });

  const reports = data?.data || [];
  const totalPages = data?.totalPages || 1;

  const setFilter = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text-primary mb-6">Histórico de Relatórios</h1>

      {/* Filtros */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <select
          value={filters.inspectorId}
          onChange={(e) => setFilter('inspectorId', e.target.value)}
          className="bg-bg-card border border-white/10 rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">Todos os inspetores</option>
          {users.filter((u) => u.status === 'ACTIVE').map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilter('startDate', e.target.value)}
          className="bg-bg-card border border-white/10 rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
          placeholder="Data início"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilter('endDate', e.target.value)}
          className="bg-bg-card border border-white/10 rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
          placeholder="Data fim"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum relatório encontrado</p>
        </div>
      ) : (
        <div className="bg-bg-card rounded-2xl border border-white/5 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Data</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Inspetor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Andares</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Resumo</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const ok = report.floorEntries.filter((e) => e.statusGeral === 'OK').length;
                const warn = report.floorEntries.filter((e) => e.statusGeral === 'ATENCAO').length;
                const err = report.floorEntries.filter((e) => e.statusGeral === 'PROBLEMA').length;
                return (
                  <tr
                    key={report.id}
                    className="border-b border-white/5 hover:bg-bg-elevated/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/historico/${report.id}`)}
                  >
                    <td className="px-5 py-3 text-sm text-text-primary font-medium">
                      {formatDate(report.date)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={report.inspector.name} src={report.inspector.avatarUrl} size="sm" />
                        <span className="text-sm text-text-primary">{report.inspector.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {report.floorEntries.slice(0, 4).map((e) => (
                          <Badge key={e.floorId} variant={e.statusGeral === 'OK' ? 'ok' : e.statusGeral === 'ATENCAO' ? 'warning' : 'error'}>
                            {e.floor.label}
                          </Badge>
                        ))}
                        {report.floorEntries.length > 4 && <Badge>+{report.floorEntries.length - 4}</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-3 text-xs font-semibold">
                        {ok > 0 && <span className="text-status-ok">{ok} OK</span>}
                        {warn > 0 && <span className="text-status-warning">{warn} Atenção</span>}
                        {err > 0 && <span className="text-status-error">{err} Problema</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs text-accent font-semibold">Ver →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-6">
          <button
            disabled={filters.page === 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className="px-4 py-2 rounded-xl bg-bg-card text-text-secondary disabled:opacity-40 text-sm border border-white/10"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-text-secondary text-sm">
            {filters.page} / {totalPages}
          </span>
          <button
            disabled={filters.page === totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className="px-4 py-2 rounded-xl bg-bg-card text-text-secondary disabled:opacity-40 text-sm border border-white/10"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
