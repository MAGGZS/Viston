'use client';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/** O que o moderador já fechou. */
export default function ChamadosConcluidosPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Concluídas"
      subtitle="Chamados fechados por você"
    >
      <ChamadosBoard buildingId={building?.building_id} group="CONCLUIDOS" />
    </ModeradorShell>
  );
}
