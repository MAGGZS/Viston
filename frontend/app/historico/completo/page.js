'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { HISTORICO_VIEWS, HistoricoSwitcher } from '@/app/components/HistoricoSwitcher';
import { HistoricoCompleto } from '@/app/components/HistoricoExpandido';
import { M, MRound, CONTENT_ID, RESPIRO_TOPO } from '@/app/components/mobile/kit';
import { useActiveBuilding } from '@/app/hooks/useActiveBuilding';
import { T, W } from '@/app/lib/theme';

/**
 * O histórico inteiro, em tela própria.
 *
 * No computador, ampliar o cartão abre uma caixa sobre o painel: quem ampliou
 * continua ali, e fechar devolve o que estava embaixo. No telefone isso estava
 * errado — caixa é interrupção, e uma lista com busca, filtro e paginação não
 * interrompe nada: é para onde a pessoa foi. Como tela, ela ganha o que uma
 * caixa não tem: endereço próprio, o botão de voltar do aparelho funcionando, e
 * um lugar de onde dá para abrir um relatório sem pilha de caixas por cima.
 *
 * A visão vem da URL, e volta para ela a cada troca: recarregar a página no meio
 * de uma consulta de ocorrências não pode devolver a lista de vistorias.
 *
 * O prédio não vem: é o mesmo que a pessoa escolheu no histórico (a escolha
 * mora no aparelho — ver `useActiveBuilding`), e repeti-lo aqui só criaria uma
 * segunda fonte para a mesma verdade.
 */
function TelaCompleta() {
  const router = useRouter();
  const params = useSearchParams();

  const daUrl = params.get('view');
  const inicial = HISTORICO_VIEWS.some((v) => v.key === daUrl) ? daUrl : HISTORICO_VIEWS[0].key;
  const [view, setView] = useState(inicial);

  const { buildingId, active, hasChoice } = useActiveBuilding();

  function trocar(proxima) {
    setView(proxima);
    // `replace`, não `push`: alternar entre as duas leituras é a mesma tela
    // mudando de assunto, e empilhar histórico faria o voltar do aparelho
    // desfazer a troca em vez de sair da tela.
    router.replace(`?view=${proxima}`, { scroll: false });
  }

  const titulo = HISTORICO_VIEWS.find((v) => v.key === view)?.title ?? 'Histórico';

  return (
    <main
      id={CONTENT_ID}
      style={{
        // `100dvh` e não `100vh`: no telefone a barra do navegador entra e sai,
        // e com `vh` o rodapé da paginação fica escondido atrás dela.
        height: '100dvh', background: M.bg,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* O respiro do topo vem do `MTopBar`: esta tela é irmã das outras do
          telefone, e um número copiado à mão aqui deixaria de descontar o
          entalhe do aparelho no dia em que lá mudasse. */}
      <header className="anim-fade-down" style={{ padding: `${RESPIRO_TOPO} 16px 14px`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MRound label="Voltar ao histórico" onClick={() => router.back()}>
            <ArrowLeft size={18} />
          </MRound>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Com dois prédios, qual deles se está lendo deixa de ser óbvio:
                a tela foi aberta de outra, e o nome não vem na URL. */}
            {hasChoice && active?.name && (
              <p style={{ color: M.faint, fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active.name}
              </p>
            )}
            {/* "Histórico" e não o nome da visão: quem titula a visão é o
                alternador logo abaixo, e repetir a mesma frase duas vezes em
                quatro centímetros de tela é desperdiçar as duas. */}
            <h1 style={{ fontFamily: M.display, fontWeight: W.title, fontSize: 19, color: M.text }}>
              Histórico
            </h1>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <HistoricoSwitcher view={view} onSelect={trocar} title={titulo} />
        </div>
      </header>

      <HistoricoCompleto view={view} buildingId={buildingId} />
    </main>
  );
}

export default function HistoricoCompletoPage() {
  return (
    <RouteGuard>
      <div style={{ background: T.bg }}>
        {/* `useSearchParams` precisa de uma fronteira de suspensão para a rota
            continuar sendo pré-renderizada — sem ela o build recusa a página. */}
        <Suspense fallback={null}>
          <TelaCompleta />
        </Suspense>
      </div>
    </RouteGuard>
  );
}
