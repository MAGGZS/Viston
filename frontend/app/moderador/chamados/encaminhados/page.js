'use client';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/**
 * O que já tem dono e espera essa pessoa dizer que recebeu.
 *
 * É a fila que o moderador cobra: encaminhar não começa o trabalho, e sem uma
 * tela própria esses chamados se misturariam ao que está sendo feito — que é
 * justamente o que ninguém sabia distinguir antes.
 */
export default function ChamadosEncaminhadosPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Encaminhados"
      subtitle="Chamados com responsável, aguardando ele confirmar o recebimento"
    >
      <ChamadosBoard buildingId={building?.building_id} group="ENCAMINHADOS" />
    </ModeradorShell>
  );
}
