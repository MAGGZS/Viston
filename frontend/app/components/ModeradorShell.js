'use client';
import { RouteGuard } from '@/app/components/RouteGuard';
import { ModeradorSidebar } from '@/app/components/ModeradorSidebar';
import { useMyBuildings } from '@/app/hooks/useApi';
import { T, W } from '@/app/lib/theme';

/**
 * O prédio de que esta pessoa é moderadora.
 *
 * A área do moderador é de um prédio: a fila de chamados, os contadores e o
 * calendário são todos dele. Quem modera mais de um cai no primeiro — e o
 * gestor que entra por aqui cai no primeiro dele, porque também trata chamados.
 */
export function useModeratorBuilding() {
  const { data: buildings = [], isLoading } = useMyBuildings();
  const building = buildings.find((b) => b.role === 'MODERADOR') ?? buildings[0] ?? null;
  return { building, isLoading };
}

/** Aviso de que a mesa do moderador é tela larga. */
function DesktopOnly() {
  return (
    <div className="lg:hidden" style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 16 }}>🖥️</div>
      <p style={{ color: T.text, fontWeight: W.title, fontSize: 18 }}>Acesse pelo computador</p>
      <p style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
        A tela de chamados mostra a lista e o detalhe lado a lado — no telefone
        não caberia nem uma coisa nem outra.
      </p>
    </div>
  );
}

/** Sem prédio nenhum não há fila para moderar. */
function NoBuilding() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 48 }}>
      <p style={{ fontSize: 40, marginBottom: 14 }}>🏢</p>
      <p style={{ color: T.text, fontWeight: W.title, fontSize: 16 }}>Você não modera nenhum prédio</p>
      <p style={{ color: T.mute, fontSize: 13, marginTop: 8, lineHeight: 1.6, maxWidth: 380 }}>
        Peça ao gestor do prédio para vincular sua conta como moderador — é ele
        quem define os papéis em Colaboradores.
      </p>
    </div>
  );
}

/**
 * A casca das telas do moderador: barra lateral fixa e o conteúdo ao lado.
 *
 * Igual à do admin de propósito — as duas são mesas de trabalho de tela larga, e
 * quem passa de uma para a outra não deveria ter de reaprender onde as coisas
 * ficam.
 */
export function ModeradorShell({ building, isLoading, title, subtitle, actions, children }) {
  return (
    <RouteGuard roles={['MODERADOR', 'GESTOR', 'ADMIN']}>
      <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
        <ModeradorSidebar buildingId={building?.building_id} buildingName={building?.name} />

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
          <header style={{ padding: '28px 32px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
            <div>
              <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title }}>{title}</h1>
              {subtitle && <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>{subtitle}</p>}
            </div>
            {actions}
          </header>

          {isLoading ? (
            <div style={{ padding: '0 32px 32px' }}>
              <div style={{ height: 320, background: T.card, borderRadius: 26 }} className="animate-pulse" />
            </div>
          ) : !building ? (
            <NoBuilding />
          ) : (
            children
          )}
        </main>
      </div>

      <DesktopOnly />
    </RouteGuard>
  );
}
