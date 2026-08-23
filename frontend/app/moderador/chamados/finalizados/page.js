'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { RelatorioModal } from '@/app/components/RelatorioModal';
import { Button } from '@/app/components/ui';
import { T } from '@/app/lib/theme';

/**
 * O que o moderador já finalizou.
 *
 * Aqui não há o que fazer com o chamado — ele acabou —, então a tela é lista, e
 * não a mesa de acompanhamento do processamento: as poucas colunas que deixam
 * achar a linha, e o resto numa caixa que abre no clique.
 *
 * O que esta tela ganhou foi o relatório. É a única que tem o dado inteiro do
 * período fechado, e por isso é daqui que sai o documento com as manutenções e
 * o gasto — não do processamento, onde nada terminou ainda.
 */
export default function ChamadosFinalizadosPage() {
  const { building, isLoading } = useModeratorBuilding();
  const [relatorio, setRelatorio] = useState(false);

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Finalizados"
      subtitle="Chamados encerrados. Clique numa linha para ver a ocorrência inteira."
      actions={
        building && (
          <Button onClick={() => setRelatorio(true)}>
            <FileText size={15} /> Gerar relatório
          </Button>
        )
      }
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 28px' }}>
        <div className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: 26, overflow: 'hidden' }}>
          <OcorrenciasTable
            buildingId={building?.building_id}
            group="CONCLUIDOS"
            columns="CONCLUIDOS"
            empty="Nenhum chamado finalizado ainda"
          />
        </div>
      </div>

      <RelatorioModal
        buildingId={building?.building_id}
        open={relatorio}
        onClose={() => setRelatorio(false)}
      />
    </ModeradorShell>
  );
}
