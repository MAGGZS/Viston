'use client';
import { ProcessamentoBoard } from '@/app/components/ProcessamentoBoard';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/**
 * Tudo que está em curso, numa tela só.
 *
 * Substituiu as três abas — encaminhados, em andamento e concluídas — que eram
 * o mesmo chamado em momentos diferentes. Separadas, obrigavam a trocar de tela
 * para saber se o responsável já tinha aceitado ou já tinha terminado, que é
 * exatamente o que o moderador precisa comparar de relance.
 */
export default function ProcessamentoPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Processamento"
      subtitle="O que foi encaminhado, o que está sendo feito e o que espera o seu fechamento"
    >
      <ProcessamentoBoard buildingId={building?.building_id} />
    </ModeradorShell>
  );
}
