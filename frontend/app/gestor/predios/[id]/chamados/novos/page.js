'use client';
import { useParams } from 'next/navigation';
import { ChamadosBoard } from '@/app/components/ChamadosBoard';
import { GestorShell } from '@/app/components/GestorShell';

/**
 * O que a vistoria abriu neste prédio e ninguém encaminhou ainda.
 *
 * A mesma mesa do moderador, com o prédio vindo da rota em vez do vínculo da
 * conta: aqui quem está lendo administra o prédio, e administra um de cada vez.
 *
 * O título e a descrição vão para a mesa, e não para a casca, pelo mesmo motivo
 * da tela do moderador: a ficha da ocorrência vai do topo da janela ao pé dela,
 * e um cabeçalho da casca atravessando a largura toda a cortaria ao meio.
 */
export default function GestorNovosChamadosPage() {
  const { id } = useParams();

  return (
    <GestorShell buildingId={id} ownHeader>
      <ChamadosBoard
        buildingId={id}
        title="Novos chamados"
        subtitle="Ocorrências que ainda não foram encaminhadas a nenhum responsável"
      />
    </GestorShell>
  );
}
