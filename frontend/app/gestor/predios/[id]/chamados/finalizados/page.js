'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { GestorShell } from '@/app/components/GestorShell';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { RelatorioModal } from '@/app/components/RelatorioModal';
import { Button } from '@/app/components/ui';
import { T, R } from '@/app/lib/theme';

/**
 * Os chamados já encerrados do prédio.
 *
 * Como no moderador, é daqui que sai o relatório do período: esta é a única tela
 * com o dado inteiro do que fechou, com as manutenções e o gasto.
 */
export default function GestorChamadosFinalizadosPage() {
  const { id } = useParams();
  const [relatorio, setRelatorio] = useState(false);

  return (
    <GestorShell
      buildingId={id}
      title="Finalizados"
      subtitle="Chamados encerrados. Clique numa linha para ver a ocorrência inteira."
      actions={
        <Button onClick={() => setRelatorio(true)} style={{ flexShrink: 0 }}>
          <FileText size={15} /> Gerar relatório
        </Button>
      }
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 28px' }}>
        <div className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: R.card, overflow: 'hidden' }}>
          <OcorrenciasTable
            buildingId={id}
            group="CONCLUIDOS"
            columns="CONCLUIDOS"
            empty="Nenhum chamado finalizado ainda"
          />
        </div>
      </div>

      <RelatorioModal buildingId={id} open={relatorio} onClose={() => setRelatorio(false)} />
    </GestorShell>
  );
}
