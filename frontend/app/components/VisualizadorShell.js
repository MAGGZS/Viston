'use client';
import { Building2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { VisualizadorSidebar } from '@/app/components/VisualizadorSidebar';
import { BuildingSwitcher } from '@/app/components/BuildingSwitcher';
import { JoinBuildingForm } from '@/app/components/JoinBuildingForm';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { CONTENT_ID } from '@/app/components/mobile/kit';
import { SoNoComputador } from '@/app/components/TelaPorLargura';
import { useAuthStore } from '@/app/store/auth';
import { isViewerOnly } from '@/app/lib/roles';
import { T, R, W } from '@/app/lib/theme';

/**
 * O prédio de que a área do visualizador está falando, e se ele supervisiona.
 *
 * A escolha é a mesma do resto do app (`useActiveBuilding`, guardada no
 * aparelho): quem está em dois prédios troca no seletor do cabeçalho, e o
 * painel e a agenda acompanham juntos.
 *
 * `supervisiona` é ser VIEWER no prédio escolhido — é o que a API exige para o
 * panorama e para escrever na agenda. A guarda da rota ainda aceita o inspetor
 * (ver a página), e para ele o painel mostra só as vistorias recentes.
 */
export function useVisualizadorBuilding({ soOndeSupervisiona = false } = {}) {
  const { buildings: todos } = useActiveBuilding();
  const { buildings, active, buildingId, setActive, isLoading } = useActiveBuilding(
    soOndeSupervisiona && todos.some((b) => b.role === 'VIEWER') ? { filter: PREDIO_SUPERVISIONADO } : undefined
  );
  return {
    buildings,
    building: active,
    buildingId,
    setActive,
    isLoading,
    supervisiona: active?.role === 'VIEWER',
    supervisionaAlgum: todos.some((b) => b.role === 'VIEWER'),
  };
}

const PREDIO_SUPERVISIONADO = (b) => b.role === 'VIEWER';

function SemPredio() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 48 }}>
      <Building2 size={44} aria-hidden="true" className="anim-pop-in" style={{ color: T.faint, marginBottom: 16 }} />
      <p className="anim-fade-up anim-d1" style={{ color: T.text, fontWeight: W.title, fontSize: 17 }}>Você não tem ligação a nenhum prédio</p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 8, marginBottom: 24 }}>
        Peça a chave ao gestor do prédio e digite abaixo para se conectar.
      </p>
      <div className="anim-fade-up anim-d3" style={{ width: '100%', maxWidth: 380 }}>
        <JoinBuildingForm />
      </div>
    </div>
  );
}

/**
 * A casca das telas do visualizador: barra lateral e o conteúdo ao lado, no
 * mesmo desenho da casca do gestor — quem supervisiona e quem gere leem a
 * mesma agenda, e não deveriam ter de reaprender onde as coisas ficam.
 *
 * - `ctx`: o retorno de `useVisualizadorBuilding()` — a página o chama, porque
 *   ela também precisa do prédio para as consultas.
 * - `title`, `subtitle`, `actions`: o cabeçalho. O seletor de prédio entra
 *   sempre por último nas ações, e só aparece com mais de um vínculo.
 */
export function VisualizadorShell({ ctx, title, subtitle, actions, children }) {
  const { buildings, building, buildingId, setActive, isLoading, supervisionaAlgum } = ctx;
  const { user } = useAuthStore();
  // No celular: quem também vistoria (ou ainda não tem prédio) tem a tela
  // inicial do telefone. Quem só visualiza não tem versão de celular — o
  // RouteGuard já o barra antes de chegar aqui; se chegar, fica só o aviso,
  // sem redirecionar (a raiz o mandaria de volta para cá).
  const destinoNoCelular = isViewerOnly(user) ? null : '/home';

  return (
    <RouteGuard roles={['INSPECTOR', 'VIEWER', 'NONE']}>
      <SoNoComputador
        destinoNoCelular={destinoNoCelular}
        texto={
          destinoNoCelular
            ? 'O painel e a agenda de quem supervisiona são do computador. No celular, a sua agenda e a vistoria ficam na tela inicial.'
            : 'O painel e a agenda de quem supervisiona são do computador. Abra o Viston num computador para continuar.'
        }
      >
      <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
        <VisualizadorSidebar buildingName={building?.name} supervisiona={supervisionaAlgum} />

        <main id={CONTENT_ID} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
          <header
            className="anim-fade-down"
            // Posicionado e acima do miolo: o seletor de prédio abre uma lista
            // que precisa passar por cima dos cartões (ver a nota da tela antiga
            // sobre o `transform` do `anim-fade-down`).
            style={{ position: 'relative', zIndex: 30, padding: '28px 32px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}
          >
            <div style={{ minWidth: 0 }}>
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title }}>{title}</h1>
              {subtitle && <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>{subtitle}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {buildingId && actions}
              <BuildingSwitcher buildings={buildings} buildingId={buildingId} onChange={setActive} />
            </div>
          </header>

          {isLoading ? (
            <div style={{ padding: '0 32px 32px' }}>
              <div style={{ height: 320, background: T.card, borderRadius: R.card }} className="anim-fade-in animate-pulse" />
            </div>
          ) : !buildingId ? (
            <SemPredio />
          ) : (
            children
          )}
        </main>
      </div>
      </SoNoComputador>
    </RouteGuard>
  );
}
