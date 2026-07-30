'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Download, Filter, Search } from 'lucide-react';
import { useInspections } from '@/hooks/useInspections';
import { Avatar, Badge } from '@/components/ui/Card';
import { formatDate, STATUS_BG, STATUS_LABELS } from '@/lib/utils';
import type { InspectionReport } from '@/types';

export default function HistoricoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useInspections({ page, limit: 20 });

  const reports = data?.data || [];
  const totalPages = data?.totalPages || 1;

  const filtered = search
    ? reports.filter(
        (r) =>
          r.inspector.name.toLowerCase().includes(search.toLowerCase()) ||
          r.building.name.toLowerCase().includes(search.toLowerCase()),
      )
    : reports;

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-extrabold text-text-primary mb-5">Histórico</h1>

      {/* Busca */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por inspetor ou prédio..."
          className="w-full bg-bg-elevated border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum relatório encontrado</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onClick={() => router.push(`/historico/${report.id}`)}
            />
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-xl bg-bg-elevated text-text-secondary disabled:opacity-40 text-sm"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-text-secondary text-sm">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-xl bg-bg-elevated text-text-secondary disabled:opacity-40 text-sm"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

function ReportCard({ report, onClick }: { report: InspectionReport; onClick: () => void }) {
  const okCount = report.floorEntries.filter((e) => e.statusGeral === 'OK').length;
  const warnCount = report.floorEntries.filter((e) => e.statusGeral === 'ATENCAO').length;
  const errCount = report.floorEntries.filter((e) => e.statusGeral === 'PROBLEMA').length;

  return (
    <button
      onClick={onClick}
      className="w-full bg-bg-card rounded-2xl p-4 border border-white/5 text-left hover:border-white/15 transition-all active:scale-[0.99]"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-text-primary">{report.building.name}</p>
          <p className="text-xs text-text-secondary mt-0.5">{formatDate(report.date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name={report.inspector.name} src={report.inspector.avatarUrl} size="sm" />
        </div>
      </div>

      {/* Andares vistoriados */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {report.floorEntries.slice(0, 6).map((entry) => (
          <Badge
            key={entry.floorId}
            variant={
              entry.statusGeral === 'OK' ? 'ok' :
              entry.statusGeral === 'ATENCAO' ? 'warning' : 'error'
            }
          >
            {entry.floor.label}
          </Badge>
        ))}
        {report.floorEntries.length > 6 && (
          <Badge>+{report.floorEntries.length - 6}</Badge>
        )}
      </div>

      {/* Mini stats */}
      <div className="flex items-center gap-3 text-xs">
        {okCount > 0 && <span className="text-status-ok font-semibold">{okCount} OK</span>}
        {warnCount > 0 && <span className="text-status-warning font-semibold">{warnCount} Atenção</span>}
        {errCount > 0 && <span className="text-status-error font-semibold">{errCount} Problema</span>}
        <span className="ml-auto text-text-muted">{report.inspector.name}</span>
      </div>
    </button>
  );
}
