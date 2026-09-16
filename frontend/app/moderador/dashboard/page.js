'use client';
import { Suspense } from 'react';
import { PainelAnalitico } from '@/app/components/analytics/PainelAnalitico';
import { ModeradorShell, useModeratorBuilding } from '@/app/components/ModeradorShell';

/**
 * O painel analítico do moderador.
 *
 * Entra como tela ao lado do painel inicial, e não no lugar dele: o inicial é a
 * porta de entrada do trabalho do dia — contadores, histórico, o que abrir
 * agora —, e este responde as perguntas de quem para para pensar no mês. Juntar
 * os dois antes de o novo provar que funciona seria trocar a tela que já serve
 * por uma que ainda não foi usada.
 *
 * O `Suspense` existe porque os filtros moram na URL: `useSearchParams` obriga
 * quem o usa a ter um limite de suspensão acima, senão a rota inteira deixa de
 * ser pré-renderizada.
 */
export default function PainelAnaliticoPage() {
  const { building, isLoading } = useModeratorBuilding();

  return (
    <ModeradorShell
      building={building}
      isLoading={isLoading}
      title="Painel analítico"
      subtitle="Como o prédio está andando, onde o processo trava e o que está fora do prazo"
    >
      <div style={{ padding: '2px 32px 32px', overflowY: 'auto' }}>
        <Suspense fallback={null}>
          <PainelAnalitico buildingId={building?.building_id} baseChamados="/moderador/chamados" />
        </Suspense>
      </div>
    </ModeradorShell>
  );
}
