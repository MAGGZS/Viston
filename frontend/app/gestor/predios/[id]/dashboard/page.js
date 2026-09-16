'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PainelAnalitico } from '@/app/components/analytics/PainelAnalitico';
import { GestorShell } from '@/app/components/GestorShell';

/**
 * O painel analítico do gestor.
 *
 * A mesma tela do moderador, com o prédio vindo da rota em vez do vínculo da
 * conta — e com os inspetores ligados. Quem gere o prédio responde pelo
 * trabalho inteiro dele: quem encontra a ocorrência e quem a resolve. O
 * moderador trabalha com o resultado da ronda, não com quem a fez.
 *
 * `podeVerInspetores` só acende o segundo botão da aba de desempenho. A guarda
 * de verdade é a rota do servidor (`requireBuildingManager`) — passar `true`
 * aqui numa conta que não gere o prédio não abriria dado nenhum, apenas um 403.
 *
 * O `Suspense` existe porque os filtros moram na URL: `useSearchParams` obriga
 * quem o usa a ter um limite de suspensão acima, senão a rota inteira deixa de
 * ser pré-renderizada.
 */
export default function GestorPainelAnaliticoPage() {
  const { id } = useParams();

  return (
    <GestorShell
      buildingId={id}
      title="Painel analítico"
      subtitle="Como o prédio está andando, onde o processo trava e como a equipe está indo"
    >
      <div style={{ padding: '2px 32px 32px', overflowY: 'auto' }}>
        <Suspense fallback={null}>
          <PainelAnalitico
            buildingId={id}
            baseChamados={`/gestor/predios/${id}/chamados`}
            podeVerInspetores
          />
        </Suspense>
      </div>
    </GestorShell>
  );
}
