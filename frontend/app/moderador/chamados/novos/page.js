'use client';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/** O que a vistoria abriu e ninguém encaminhou ainda. */
export default function NovosChamadosPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Novos chamados"
      subtitle="Ocorrências que ainda não foram encaminhadas a nenhum responsável"
    >
      <ChamadosBoard buildingId={building?.building_id} />
    </ModeradorShell>
  );
}
