'use client';
import { useParams } from 'next/navigation';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { GestorShell } from '@/app/components/GestorShell';

/**
 * O que a vistoria abriu neste prédio e ninguém encaminhou ainda.
 *
 * A mesma mesa do moderador, com o prédio vindo da rota em vez do vínculo da
 * conta: aqui quem está lendo administra o prédio, e administra um de cada vez.
 */
export default function GestorNovosChamadosPage() {
  const { id } = useParams();

  return (
    <GestorShell
      buildingId={id}
      title="Novos chamados"
      subtitle="Ocorrências que ainda não foram encaminhadas a nenhum responsável"
    >
      <ChamadosBoard buildingId={id} group="NOVOS" />
    </GestorShell>
  );
}
