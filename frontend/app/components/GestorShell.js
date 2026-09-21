'use client';
import { Snowflake } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { GestorSidebar } from '@/app/components/GestorSidebar';
import { useManagedBuildings } from '@/app/hooks/useApi';
import { T, W } from '@/app/lib/theme';
import { CONTENT_ID } from '@/app/components/mobile/kit';

/**
 * O prédio da rota, entre os que esta conta administra.
 *
 * Sai da listagem que a tela inicial do gestor já carrega, e não de uma consulta
 * própria: as cinco abas do prédio precisam do nome para o cabeçalho e para a
 * barra lateral, e uma consulta em cache serve todas elas sem uma ida a mais ao
 * servidor por troca de aba.
 */
export function useManagedBuilding(id) {
  const { data: buildings = [], isLoading } = useManagedBuildings();
  return { building: buildings.find((b) => b.id === id) ?? null, isLoading };
}

/**
 * Aviso de que a mesa do gestor é tela larga.
 *
 * Como no moderador, o layout mora nas classes e não no `style`: `lg:hidden`
 * esconde por folha de estilo, e um `display` inline venceria essa regra.
 */
function DesktopOnly() {
  return (
    <div
      className="lg:hidden flex flex-col items-center justify-center min-h-screen text-center"
      style={{ background: T.bg, padding: 32 }}
    >
      <div className="anim-pop-in" style={{ fontSize: 44, marginBottom: 16 }}>🖥️</div>
      <p className="anim-fade-up anim-d1" style={{ color: T.text, fontWeight: W.title, fontSize: 18 }}>Acesse pelo computador</p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
        A gestão do prédio mostra calendário, histórico e chamados lado a lado —
        no telefone não caberia nem uma coisa nem outra.
      </p>
    </div>
  );
}

/**
 * A casca das telas do prédio: barra lateral fixa e o conteúdo ao lado.
 *
 * É a mesma do moderador de propósito. O gestor passou a ter as abas de chamado
 * dele, e quem troca de uma área para a outra não deveria ter de reaprender onde
 * as coisas ficam.
 *
 * `title` e `subtitle` caem no nome e na descrição do prédio quando a tela não
 * diz outra coisa — é o que o painel quer, e é o que a tela sem nome nenhum
 * deveria mostrar.
 */
/**
 * O aviso de prédio inativo.
 *
 * Congelado, o prédio continua abrindo e continua sendo lido — e é justamente
 * por isso que ele precisa dizer o que é: sem esta faixa, a pessoa descobriria
 * o congelamento tentando cadastrar um andar e levando um 403 que não explica
 * por que hoje é diferente de ontem.
 *
 * Fica acima do cabeçalho, e não dentro da tela: vale para todas as abas do
 * prédio, e repetir a faixa em cada uma seria quatro lugares para esquecer.
 */
function FaixaDeCongelamento({ desde }) {
  return (
    <div
      role="status"
      style={{
        background: T.accentSoft,
        borderBottom: `1px solid ${T.accentLine}`,
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <Snowflake size={16} color={T.accentInk} aria-hidden="true" style={{ flexShrink: 0 }} />
      <p style={{ color: T.accentInk, fontSize: 13, lineHeight: 1.5 }}>
        Este prédio está inativo desde {new Date(desde).toLocaleDateString('pt-BR')}. O histórico
        continua aberto para leitura, mas vistoria, chamado e convite novos estão suspensos —
        regularize o plano em <a href="/gestor/cobranca" style={{ textDecoration: 'underline' }}>Planos e cobrança</a>.
      </p>
    </div>
  );
}

export function GestorShell({ buildingId, title, subtitle, actions, ownHeader = false, children }) {
  const { building, isLoading } = useManagedBuilding(buildingId);

  const heading = title ?? building?.name;
  const support = subtitle ?? building?.description;

  return (
    <RouteGuard manages={buildingId}>
      <div className="hidden lg:flex" style={{ minHeight: '100vh', background: T.bg }}>
        <GestorSidebar buildingId={buildingId} buildingName={building?.name} />

        <main id={CONTENT_ID} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' }}>
          {building?.frozen_at && <FaixaDeCongelamento desde={building.frozen_at} />}
          {/* A barra lateral não anima na entrada: ela remonta a cada troca de
              aba, e piscar o menu inteiro a cada clique seria ruído. Quem entra
              é o conteúdo, que é o que mudou.

              `ownHeader` é a tela dizendo que desenha o próprio cabeçalho, e vale
              o mesmo que na casca do moderador: a triagem põe a ficha da
              ocorrência do topo da janela ao pé dela, e um cabeçalho ocupando a
              largura toda cortaria essa coluna ao meio. */}
          {!ownHeader && (
            <header className="anim-fade-down" style={{ padding: '28px 32px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                {heading ? (
                  <h1 style={{ color: T.text, fontSize: 22, fontWeight: W.title }}>{heading}</h1>
                ) : isLoading ? (
                  <div style={{ height: 26, width: 200, background: T.chip, borderRadius: 8 }} className="animate-pulse" />
                ) : null}
                {support && <p style={{ color: T.mute, fontSize: 14, marginTop: 4 }}>{support}</p>}
              </div>
              {actions}
            </header>
          )}

          {children}
        </main>
      </div>

      <DesktopOnly />
    </RouteGuard>
  );
}
