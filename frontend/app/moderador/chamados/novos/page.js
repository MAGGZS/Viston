'use client';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/**
 * O que a vistoria abriu e ninguém encaminhou ainda.
 *
 * O título e a descrição vão para a mesa, e não para a casca: a ficha da
 * ocorrência ocupa a coluna da direita do topo da janela ao pé dela, e um
 * cabeçalho da casca atravessando a largura toda a cortaria ao meio. Daí o
 * `ownHeader` — ver ModeradorShell.
 */
export default function NovosChamadosPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell building={building} isLoading={isLoading} ownHeader>
      <ChamadosBoard
        buildingId={building?.building_id}
        title="Novos chamados"
        subtitle="Ocorrências que ainda não foram encaminhadas a nenhum responsável"
      />
    </ModeradorShell>
  );
}
