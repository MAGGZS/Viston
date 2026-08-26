'use client';
import { useParams } from 'next/navigation';
import { ProcessamentoBoard } from '@/app/components/ProcessamentoBoard';
import { GestorShell } from '@/app/components/GestorShell';

/** Tudo que está em curso no prédio, numa tela só — como no moderador. */
export default function GestorProcessamentoPage() {
  const { id } = useParams();

  return (
    <GestorShell
      buildingId={id}
      title="Processamento"
      subtitle="O que foi encaminhado, o que está sendo feito e o que espera o seu fechamento"
    >
      <ProcessamentoBoard buildingId={id} />
    </GestorShell>
  );
}
