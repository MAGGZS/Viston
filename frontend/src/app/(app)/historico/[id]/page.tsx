'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileDown, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { useInspection } from '@/hooks/useInspections';
import { Avatar, Badge } from '@/components/ui/Card';
import { formatDate, STATUS_BG, STATUS_LABELS } from '@/lib/utils';

export default function RelatorioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const concluido = searchParams.get('concluido') === '1';

  const { data: report, isLoading } = useInspection(id);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-dvh">
        <span className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="px-4 pt-6 pb-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-text-primary">Relatório</h1>
      </div>

      {/* Banner de conclusão */}
      {concluido && (
        <div className="bg-status-ok/10 border border-status-ok/30 rounded-2xl p-4 flex items-center gap-3 mb-5">
          <CheckCircle size={24} className="text-status-ok shrink-0" />
          <div>
            <p className="font-bold text-status-ok">Inspeção concluída!</p>
            <p className="text-xs text-text-secondary">Relatório gerado com sucesso.</p>
          </div>
        </div>
      )}

      {/* Cabeçalho do relatório */}
      <div className="bg-bg-card rounded-2xl p-4 border border-white/5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-extrabold text-text-primary text-lg">{report.building.name}</h2>
            <p className="text-text-secondary text-sm">{formatDate(report.date)}</p>
          </div>
          <Badge variant="ok">{report.floorEntries.length} andares</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Avatar name={report.inspector.name} src={report.inspector.avatarUrl} size="sm" />
          <span className="text-sm text-text-secondary">{report.inspector.name}</span>
        </div>
      </div>

      {/* Downloads */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <a
          href={report.pdfUrl || `/api/inspections/${id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-bg-card border border-white/10 rounded-2xl p-3 text-sm font-semibold text-text-primary hover:border-accent/50 transition-all"
        >
          <FileDown size={18} className="text-accent" />
          PDF
        </a>
        <a
          href={report.excelUrl || `/api/inspections/${id}/excel`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-bg-card border border-white/10 rounded-2xl p-3 text-sm font-semibold text-text-primary hover:border-accent/50 transition-all"
        >
          <FileSpreadsheet size={18} className="text-status-ok" />
          Excel
        </a>
      </div>

      {/* Resumo por andar */}
      <h3 className="font-bold text-text-primary mb-3">Andares Vistoriados</h3>
      <div className="flex flex-col gap-3">
        {report.floorEntries.map((entry) => (
          <div key={entry.floorId} className="bg-bg-card rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-text-primary">{entry.floor.label}</span>
              <Badge
                variant={
                  entry.statusGeral === 'OK' ? 'ok' :
                  entry.statusGeral === 'ATENCAO' ? 'warning' : 'error'
                }
              >
                {STATUS_LABELS[entry.statusGeral]}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {entry.items.map((item) => (
                <div
                  key={item.itemName}
                  className="bg-bg-elevated rounded-lg p-2 text-center"
                >
                  <p className="text-[10px] text-text-muted leading-tight mb-1">{item.itemName}</p>
                  <span className={`text-xs font-bold ${STATUS_BG[item.status]?.split(' ')[1] || 'text-text-secondary'}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
              ))}
            </div>

            {entry.notes && (
              <p className="text-xs text-text-secondary bg-bg-elevated rounded-lg p-2">
                {entry.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
