'use client';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Sheet, ChevronRight } from 'lucide-react';
import { Avatar, StatusBadge, EmptyState } from './ui';
import { ClipboardList } from 'lucide-react';

export function InspectionList({ inspections = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card animate-pulse h-24 bg-bg-card" />
        ))}
      </div>
    );
  }

  if (!inspections.length) {
    return <EmptyState icon={ClipboardList} title="Nenhuma vistoria encontrada" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {inspections.map((report) => (
        <InspectionCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function InspectionCard({ report }) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={report.inspector.name} url={report.inspector.avatarUrl} size="sm" />
          <div>
            <p className="font-semibold text-sm">{report.inspector.name}</p>
            <p className="text-xs text-text-secondary">
              {format(new Date(report.date), "d 'de' MMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
        </div>
        <StatusBadge status={report.status} />
      </div>

      <div className="flex flex-wrap gap-1">
        {report.floorEntries?.map((entry) => (
          <span key={entry.id} className="badge bg-white/10 text-text-secondary text-[10px]">
            {entry.floor.label}
          </span>
        ))}
      </div>

      {report.status === 'COMPLETED' && (
        <div className="flex gap-2 pt-1 border-t border-white/10">
          {report.pdfUrl && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/inspections/${report.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent font-medium"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </a>
          )}
          {report.excelUrl && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/inspections/${report.id}/excel`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent font-medium"
            >
              <Sheet className="w-3.5 h-3.5" /> Excel
            </a>
          )}
        </div>
      )}
    </div>
  );
}
