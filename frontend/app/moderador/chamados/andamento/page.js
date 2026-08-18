'use client';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/** O que já está com um responsável — inclusive o que ele diz ter terminado. */
export default function ChamadosEmAndamentoPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Em andamento"
      subtitle="Chamados encaminhados. O fechamento é seu — informar conclusão não fecha."
    >
      <ChamadosBoard buildingId={building?.building_id} group="ANDAMENTO" />
    </ModeradorShell>
  );
}
