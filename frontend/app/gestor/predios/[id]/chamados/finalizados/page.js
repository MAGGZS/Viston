'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { GestorShell } from '@/app/components/GestorShell';
import { FiltrosChamados, useFiltrosChamados } from '@/app/components/FiltrosChamados';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { RelatorioModal } from '@/app/components/RelatorioModal';
import { T, R } from '@/app/lib/theme';

/**
 * Os chamados já encerrados do prédio.
 *
 * Como no moderador, é daqui que sai o relatório do período: esta é a única tela
 * com o dado inteiro do que fechou, com as manutenções e o gasto. E, como lá, os
 * filtros ficam entre o título e a lista — arquivo é o que se consulta.
 */
export default function GestorChamadosFinalizadosPage() {
  const { id } = useParams();
  const [relatorio, setRelatorio] = useState(false);
  const { filtros, setFiltros, params } = useFiltrosChamados();

  return (
    <GestorShell
      buildingId={id}
      title="Finalizados"
      subtitle="Chamados encerrados. Clique numa linha para ver a ocorrência inteira."
      actions={
        <button
          onClick={() => setRelatorio(true)}
          className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0"
        >
          <FileText size={15} /> Gerar relatório
        </button>
      }
    >
      <FiltrosChamados
        buildingId={id}
        filtros={filtros}
        onChange={setFiltros}
        style={{ padding: '0 24px 16px', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 28px' }}>
        <div className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: R.card, overflow: 'hidden' }}>
          <OcorrenciasTable
            buildingId={id}
            group="CONCLUIDOS"
            columns="CONCLUIDOS"
            filters={params}
            empty="Nenhum chamado finalizado ainda"
          />
        </div>
      </div>

      <RelatorioModal buildingId={id} open={relatorio} onClose={() => setRelatorio(false)} />
    </GestorShell>
  );
}
