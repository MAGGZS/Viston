'use client';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';
import { OcorrenciasTable } from '@/app/components/OcorrenciasTable';
import { T } from '@/app/lib/theme';

/**
 * O que o moderador já fechou.
 *
 * Aqui não há o que fazer — o chamado acabou —, então a tela deixou de ser a
 * mesa de duas colunas das outras filas e virou lista, como a de usuários do
 * admin: as poucas colunas que deixam achar a linha, e o resto numa caixa que
 * abre no clique. É a leitura que esta tela pede: passar o olho no que foi
 * fechado, e abrir o que interessa para ver o problema, o gasto, quem concluiu
 * e qual moderador finalizou.
 */
export default function ChamadosConcluidosPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Concluídas"
      subtitle="Chamados fechados. Clique numa linha para ver a ocorrência inteira."
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 28px' }}>
        <div className="anim-fade-up anim-d1" style={{ background: T.card, borderRadius: 26, overflow: 'hidden' }}>
          <OcorrenciasTable
            buildingId={building?.building_id}
            group="CONCLUIDOS"
            columns="CONCLUIDOS"
            empty="Nenhum chamado fechado ainda"
          />
        </div>
      </div>
    </ModeradorShell>
  );
}
