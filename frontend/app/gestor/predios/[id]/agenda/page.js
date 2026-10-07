'use client';
import { useParams } from 'next/navigation';
import { GestorShell, useManagedBuilding } from '@/app/components/GestorShell';
import { AgendaPredio } from '@/app/components/agenda/AgendaPredio';

/**
 * A agenda de vistorias do prédio, na mesa do gestor.
 *
 * `frozen` vem da mesma listagem que a casca já usa para a faixa de prédio
 * inativo: congelado, a agenda continua aberta para leitura e o servidor
 * recusaria qualquer escrita — melhor não oferecer o botão.
 */
export default function GestorAgendaPage() {
  const { id } = useParams();
  const { building } = useManagedBuilding(id);

  return (
    <GestorShell
      buildingId={id}
      title="Agenda"
      subtitle="Quem vistoria o quê, e até quando"
    >
      <AgendaPredio buildingId={id} canEdit frozen={!!building?.frozen_at} />
    </GestorShell>
  );
}
