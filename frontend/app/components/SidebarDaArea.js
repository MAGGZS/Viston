'use client';
import { InspetorSidebar } from '@/app/components/InspetorSidebar';
import { VisualizadorSidebar } from '@/app/components/VisualizadorSidebar';
import { useVisualizadorBuilding } from '@/app/components/VisualizadorShell';
import { destinoNoComputador } from '@/app/components/TelaPorLargura';

/**
 * A área de computador do inspetor e a do visualizador, vista de fora delas.
 *
 * As duas barras levam a telas comuns — Histórico e Perfil —, e essas telas
 * abriam sem barra nenhuma: clicar em "Histórico" tirava a pessoa da área dela
 * e não deixava caminho de volta. A área é a mesma que a raiz escolhe para a
 * conta no computador (`destinoNoComputador`), para a barra que aparece aqui
 * ser a mesma de onde ela veio.
 *
 * Devolve `'inspetor'`, `'visualizador'` ou `null` (gestor, admin, moderador e
 * responsável têm barra própria, decidida por quem chama).
 */
export function areaDeComputador(user) {
  if (!user) return null;
  const destino = destinoNoComputador(user);
  if (destino === '/desktop/inspetor') return 'inspetor';
  if (destino === '/desktop/visualizacao') return 'visualizador';
  return null;
}

function BarraDoVisualizador() {
  const { building, supervisionaAlgum } = useVisualizadorBuilding();
  return <VisualizadorSidebar buildingName={building?.name} supervisiona={supervisionaAlgum} />;
}

/** A barra da área do inspetor ou do visualizador; nada para as outras contas. */
export function SidebarDaArea({ user }) {
  const area = areaDeComputador(user);
  if (area === 'inspetor') return <InspetorSidebar />;
  if (area === 'visualizador') return <BarraDoVisualizador />;
  return null;
}
