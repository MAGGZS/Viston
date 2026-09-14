'use client';
import { AlertTriangle } from 'lucide-react';
import { StatCard } from '@/app/components/ui';
import { useAnalyticsQueue } from '@/app/hooks/useApi';

/**
 * O cartão de chamados vencidos, no topo das duas telas de entrada.
 *
 * Um componente, e não o mesmo `StatCard` escrito duas vezes: o moderador e o
 * gestor veem o mesmo número, e a única diferença entre as duas telas é para
 * onde o clique leva. Duas cópias divergiriam num rótulo de cada vez — e este é
 * o lugar do produto onde duas telas dizendo coisas diferentes sobre o mesmo
 * prazo é o pior defeito possível.
 *
 * **Por que ele existe.** As telas de entrada abriam com contagens de estado —
 * quantos abertos, quantos em andamento, quantas vistorias, quantos inspetores.
 * Nenhuma delas é boa ou má notícia, e nenhuma muda o que a pessoa vai fazer
 * nos próximos minutos. Quem precisava saber que havia chamado vencido tinha de
 * abrir o painel analítico e procurar. A informação mais acionável do sistema
 * estava a dois cliques da tela em que todo mundo cai.
 *
 * O número vem de `/analytics/queue`, que lê as mesmas expressões de SLA do
 * bloco "Pede atenção" do painel. Não é uma contagem paralela: se as duas
 * pudessem discordar, o cartão perderia o crédito na primeira vez que
 * discordassem.
 */
export function CartaoForaDoPrazo({ buildingId, href, className = 'anim-fade-up anim-d5' }) {
  const { data: fila, isLoading } = useAnalyticsQueue(buildingId);

  return (
    <StatCard
      className={className}
      icon={AlertTriangle}
      label="Fora do prazo"
      value={fila?.atrasados}
      loading={isLoading}
      alerta
      href={href}
      hint={dicaDaFila(fila)}
    />
  );
}

/**
 * A linha embaixo do número.
 *
 * Zero atrasados não é a mesma coisa que nada acontecendo: pode haver três
 * prestes a estourar, e o cartão que diz só "0" manda a pessoa embora tranquila
 * no dia exato em que ela deveria abrir o painel. A dica carrega o resto da
 * fila, e é ela que faz o cartão ser aviso em vez de placar.
 */
export function dicaDaFila(fila) {
  if (!fila) return undefined;

  const restante = fila.em_risco + fila.parados;

  if (fila.atrasados === 0) {
    return restante === 0
      ? 'nada perto de estourar'
      : `nenhum atrasado · ${restante} ${restante === 1 ? 'pede' : 'pedem'} atenção`;
  }

  return restante === 0 ? 'clique para ver quais' : `e mais ${restante} pedindo atenção`;
}
