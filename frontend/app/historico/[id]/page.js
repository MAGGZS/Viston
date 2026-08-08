'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Building2, CalendarDays, FileSpreadsheet, UserRound } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Badge, Button, Card, Spinner } from '@/app/components/ui';
import { useInspection, useGenerateExcel } from '@/app/hooks/useApi';
import { sortFloorsDesc } from '@/app/lib/floorOrder';
import { MAINTENANCE_TYPES, CATEGORIES, PRIORITIES, RECORD_STATUS, labelOf } from '@/app/lib/maintenanceOptions';
import { useToastStore } from '@/app/store/toast';

const S = {
  label: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  meta: { display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  cell: { display: 'flex', flexDirection: 'column', gap: 2 },
  cellLabel: { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  cellValue: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
};

const FLOOR_STATUS = {
  OK: { label: 'OK', variant: 'success' },
  ATENCAO: { label: 'Atenção', variant: 'warning' },
  PROBLEMA: { label: 'Problema', variant: 'danger' },
};

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

function RecordCard({ record, index }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ color: '#F5C518', fontWeight: 600, fontSize: 12 }}>Informação {index + 1}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge variant={PRIORITY_VARIANT[record.priority] ?? 'default'}>{labelOf(PRIORITIES, record.priority)}</Badge>
          <Badge>{labelOf(RECORD_STATUS, record.status)}</Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div style={S.cell}>
          <span style={S.cellLabel}>Tipo de manutenção</span>
          <span style={S.cellValue}>{labelOf(MAINTENANCE_TYPES, record.maintenance_type)}</span>
        </div>
        <div style={S.cell}>
          <span style={S.cellLabel}>Categoria</span>
          <span style={S.cellValue}>{labelOf(CATEGORIES, record.category)}</span>
        </div>
        <div style={S.cell}>
          <span style={S.cellLabel}>Responsável</span>
          <span style={S.cellValue}>{record.responsible}</span>
        </div>
      </div>

      <div style={S.cell}>
        <span style={S.cellLabel}>Descrição</span>
        <span style={{ ...S.cellValue, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{record.description}</span>
      </div>
    </div>
  );
}

export default function VistoriaDetalhePage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: report, isLoading, error } = useInspection(id);
  const generateExcel = useGenerateExcel();
  const { show: toast } = useToastStore();

  // Andares do mais alto para o mais baixo — mesma ordem em que a vistoria foi feita
  const entries = sortFloorsDesc(
    (report?.floor_form_entries ?? []).map((e) => ({ ...e, label: e.floor?.label ?? '' }))
  );
  const totalRecords = entries.reduce((sum, e) => sum + (e.maintenance_records?.length ?? 0), 0);

  async function handleGenerateExcel() {
    try {
      const { excel_url } = await generateExcel.mutateAsync(id);
      toast('Planilha gerada!', 'success');
      if (excel_url) window.open(excel_url, '_blank', 'noreferrer');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao gerar planilha', 'error');
    }
  }

  return (
    <RouteGuard>
      <div style={{ minHeight: '100vh', background: '#080810', paddingBottom: 60 }}>
        <div style={{ position: 'sticky', top: 0, background: 'rgba(8,8,16,0.95)', backdropFilter: 'blur(12px)', padding: '48px 20px 16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4 }}>
            <ArrowLeft size={22} />
          </button>
          <h1 style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700, fontSize: 18 }}>Relatório da Vistoria</h1>
        </div>

        <div style={{ padding: '8px 20px', maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>}

          {error && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>📋</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Relatório não encontrado</p>
            </div>
          )}

          {report && (
            <>
              {/* Resumo */}
              <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: 'rgba(245,197,24,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={18} color="#F5C518" />
                  </div>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 16 }}>{report.building?.name}</p>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                      {entries.length} andar{entries.length !== 1 ? 'es' : ''} · {totalRecords} ocorrência{totalRecords !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div style={S.meta}>
                    <CalendarDays size={15} color="rgba(245,197,24,0.8)" />
                    <span>Aberta em {format(new Date(report.date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                  </div>
                  <div style={S.meta}>
                    <UserRound size={15} color="rgba(245,197,24,0.8)" />
                    <span>{report.inspector?.name ?? 'Usuário removido'}</span>
                  </div>
                </div>

                {report.excel_url ? (
                  <a href={report.excel_url} target="_blank" rel="noreferrer">
                    <Button variant="secondary" style={{ width: '100%' }}>
                      <FileSpreadsheet size={15} /> Baixar planilha Excel
                    </Button>
                  </a>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                      A planilha desta vistoria ainda não foi gerada.
                    </p>
                    <Button onClick={handleGenerateExcel} loading={generateExcel.isPending} style={{ width: '100%' }}>
                      <FileSpreadsheet size={15} /> Gerar planilha Excel
                    </Button>
                  </div>
                )}
              </Card>

              {/* Andares, do mais alto para o mais baixo */}
              {entries.map((entry) => {
                const status = FLOOR_STATUS[entry.status_geral] ?? { label: entry.status_geral, variant: 'default' };
                const records = entry.maintenance_records ?? [];
                return (
                  <Card key={entry.floor_id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 15 }}>{entry.floor?.label}</p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    {records.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Nada a relatar neste andar.</p>
                    ) : (
                      records.map((record, i) => <RecordCard key={record.id ?? i} record={record} index={i} />)
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>
    </RouteGuard>
  );
}
