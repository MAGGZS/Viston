'use client';
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';
import { FiltrosChamados, useFiltrosChamados } from '@/app/components/FiltrosChamados';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { RelatorioModal } from '@/app/components/RelatorioModal';
import { T, R } from '@/app/lib/theme';

/**
 * O que o moderador já finalizou.
 *
 * Aqui não há o que fazer com o chamado — ele acabou —, então a tela é lista, e
 * não a mesa de acompanhamento do processamento: as poucas colunas que deixam
 * achar a linha, e o resto numa caixa que abre no clique.
 *
 * Lista de arquivo é lista que se consulta, e é por isso que os filtros ficam
 * entre o título e ela: a pergunta de quem abre esta tela quase nunca é "o que
 * fechou por último" — é "quanto se gastou de elétrica no 6º andar em julho".
 *
 * O que esta tela ganhou foi o relatório. É a única que tem o dado inteiro do
 * período fechado, e por isso é daqui que sai o documento com as manutenções e
 * o gasto — não do processamento, onde nada terminou ainda. Ele fica no
 * cabeçalho, com a cara dos demais botões de canto de tela: o dourado é da ação
 * primária, e nesta tela a ação primária é ler.
 */
export default function ChamadosFinalizadosPage() {
  const { building, isLoading } = useModeratorBuilding();
  const [relatorio, setRelatorio] = useState(false);
  const { filtros, setFiltros, params } = useFiltrosChamados();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Finalizados"
      subtitle="Chamados encerrados. Clique numa linha para ver a ocorrência inteira."
      actions={
        building && (
          <button
            onClick={() => setRelatorio(true)}
            className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0"
          >
            <FileText size={15} /> Gerar relatório
          </button>
        )
      }
    >
      {/* Fora da área que rola: os filtros dizem o que a lista está mostrando, e
          perdê-los na primeira rolagem é perder essa explicação. */}
      <FiltrosChamados
        buildingId={building?.building_id}
        filtros={filtros}
        onChange={setFiltros}
        style={{ padding: '0 24px 16px', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 28px' }}>
        <div className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: R.card, overflow: 'hidden' }}>
          <OcorrenciasTable
            buildingId={building?.building_id}
            group="CONCLUIDOS"
            columns="CONCLUIDOS"
            filters={params}
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
