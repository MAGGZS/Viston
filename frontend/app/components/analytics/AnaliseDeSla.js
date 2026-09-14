'use client';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { labelOf, PRIORITIES } from '@/app/lib/maintenanceOptions';
import { TIPO } from './escala';
import { T, W, NUM } from '@/app/lib/theme';
import { Colunas } from './Colunas';
import { Distribuicao } from './Distribuicao';
import { SeletorInterno } from './SeletorDeVisao';

/**
 * O prazo no período: quanto se cumpriu, onde se perdeu, e quanto cada um levou.
 *
 * O bloco tinha um quarto papel — a lista dos que estavam prestes a estourar —,
 * e ela era a única superfície de ação do painel inteiro, três blocos abaixo do
 * topo, dentro de um cartão de retrospecto. Subiu para "Pede atenção", junto
 * dos atrasados e dos parados, onde é trabalho do dia. No lugar dela entrou a
 * distribuição, que é leitura do período como todo o resto deste cartão.
 *
 * Três colunas, uma por prioridade, com a altura no tempo médio de resolução e
 * a meta atravessada por uma linha tracejada. É o desenho que responde a
 * pergunta do bloco de relance: a coluna que passa da própria linha é a
 * prioridade que não está sendo cumprida, e não é preciso ler número nenhum
 * para ver qual é. A coluna só acende, porém, com chamados que bastem — o `n`
 * vai escrito embaixo de cada uma.
 *
 * A meta entra como linha, e não como segunda coluna ao lado: duas colunas por
 * prioridade viram seis colunas e uma legenda, e a comparação que importa —
 * "passou ou não passou da própria meta" — fica escondida dentro de um par.
 * Cada prioridade tem meta diferente, então a linha muda de altura de coluna
 * para coluna, que é exatamente a informação.
 *
 * A tinta segue a regra do produto: só o que pede socorro é colorido. A coluna
 * que estourou a meta é `danger`, o resto é a tinta neutra do gráfico. Um par
 * verde-e-vermelho gastaria duas cores para dizer o que uma diz, e o verde do
 * tema é claro demais para virar preenchimento sobre o cartão escuro.
 */

/**
 * As duas maneiras de ler o tempo de resolução.
 *
 * "Por prioridade" vem primeiro porque é a que aciona alguém: ela nomeia a
 * prioridade cujo prazo não está sendo cumprido. A distribuição é a segunda
 * pergunta — a que se faz depois de ver que a média estourou e querer saber se
 * foi todo mundo ou três chamados.
 */
const LEITURAS = [
  { key: 'PRIORIDADE', rotulo: 'Por prioridade' },
  { key: 'DISTRIBUICAO', rotulo: 'Distribuição' },
];

/**
 * O piso que as duas leituras compartilham.
 *
 * É a altura da mais alta das duas (as colunas por prioridade, com rótulo,
 * sublinha e nota sob cada uma). A distribuição pede menos e sobra espaço — e
 * sobrar é o preço de a página não se mexer quando alguém troca de aba.
 */
const ALTURA_DA_LEITURA = 236;

/** Um dígito decimal com vírgula — a escrita de número deste painel. */
const umDecimal = (n) => (n === null || n === undefined ? null : n.toFixed(1).replace('.', ','));

/**
 * O teto de dias úteis de uma faixa, lido do próprio `id`.
 *
 * Os `id` vêm do servidor (`FAIXAS_DE_CICLO`) na forma "0-1", "3", "11-15" e
 * "15+". Ler o teto deles é o que permite posicionar as marcas sem uma segunda
 * tabela de cortes aqui — que é como as duas pontas passariam a discordar sobre
 * onde a faixa termina.
 */
function limiteDaFaixa(id) {
  if (String(id).endsWith('+')) return Infinity;
  const partes = String(id).split('-').map(Number);
  return partes[partes.length - 1];
}

/**
 * O tempo de resolução, em percentis.
 *
 * Era a média, e a média mente aqui de duas formas ao mesmo tempo.
 *
 * A primeira é a forma da distribuição: tempo de ciclo é torto para a direita —
 * a maioria fecha rápido e alguns poucos levam meses —, e os poucos puxam a
 * média para longe de qualquer chamado real. Este prédio tinha média de 6,5
 * dias com metade fechando em 5 e um décimo passando de 15: nenhum chamado
 * levou 6,5. O p50 é o que metade cumpre; o p90 é a cauda que o prédio sente.
 *
 * A segunda é o viés de sobrevivência, e essa nenhum percentil resolve: os dois
 * contam só o que fechou. O antídoto é a idade da fila ainda aberta, no bloco
 * "A fila hoje" — e é lá que a comparação está escrita.
 *
 * A média continua vindo na resposta do servidor. Ela só saiu da tela.
 */
function TempoDeCiclo({ kpis, base }) {
  const p50 = umDecimal(kpis?.ciclo_p50_dias_uteis);
  const p90 = umDecimal(kpis?.ciclo_p90_dias_uteis);

  const n = kpis?.amostra?.fechados ?? 0;
  const minimo = kpis?.amostra?.minimo ?? 5;
  // Abaixo do piso o delta contra o período anterior não é comparação — é a
  // diferença entre dois números que a próxima semana muda por inteiro.
  const delta = n >= minimo ? kpis?.variacao?.tempo_medio_dias_uteis : null;

  // Sem `textAlign: right`: no desktop quem o empurra para a direita é o
  // `space-between` do pai, e no telefone, onde ele desce para a linha de
  // baixo, o texto alinhado à direita ficava solto no meio do nada.
  return (
    <div>
      <span
        style={{
          ...TIPO.figura, color: T.text, lineHeight: 1,
        }}
      >
        {p50 === null ? '—' : `${p50} d`}
      </span>
      <p style={{ color: T.mute, fontSize: 11, marginTop: 4 }}>
        metade fecha até isso
      </p>
      {/* O p90 vem sempre junto do p50, e menor. Sozinho, o p50 seria a média
          com outro nome: é o par que mostra o tamanho da cauda. */}
      {p90 !== null && (
        <p style={{ color: T.faint, fontSize: 11, marginTop: 2, ...NUM }}>
          um décimo passa de {p90} d
        </p>
      )}
      {delta !== null && delta !== undefined && (
        <p
          style={{
            color: delta > 0 ? T.danger : T.faint, fontSize: 11,
            fontWeight: delta > 0 ? W.strong : W.body, marginTop: 2, ...NUM,
          }}
        >
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1).replace('.', ',')} d
          <span style={{ color: T.faint, fontWeight: W.body }}> na média, vs. {base}</span>
        </p>
      )}
    </div>
  );
}

/** O termômetro do período: quanto do que fechou saiu no prazo. */
function Cumprimento({ dentro, atrasados, minimo = 5 }) {
  const total = dentro + atrasados;
  /**
   * Abaixo do piso, o percentual continua na tela — em cinza, com a ressalva
   * colada nele.
   *
   * Escondê-lo seria a outra mentira, a de que não há dado. O que não pode é
   * "50%" sobre dois chamados ter a mesma tipografia de "50%" sobre duzentos:
   * foi assim que o painel passou a acusar piora porque um chamado a mais
   * atrasou.
   */
  const sustenta = total >= minimo;

  if (total === 0) {
    return (
      <p style={{ color: T.mute, fontSize: 13 }}>
        Nenhum chamado foi concluído neste período, então não há prazo cumprido a medir.
      </p>
    );
  }

  const pct = Math.round((dentro / total) * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* A coluna empilhada ao lado do número: a mesma grandeza nas duas
          linguagens, para quem lê o número e para quem lê a forma. */}
      <div
        aria-hidden="true"
        style={{
          width: 22, height: 58, display: 'flex', flexDirection: 'column', gap: 2,
          flexShrink: 0,
        }}
      >
        {atrasados > 0 && (
          <span
            style={{
              height: `${(atrasados / total) * 100}%`, background: T.danger,
              borderRadius: '4px 4px 0 0',
            }}
          />
        )}
        {dentro > 0 && (
          <span
            style={{
              height: `${(dentro / total) * 100}%`, background: T.mute, opacity: 0.42,
              borderRadius: atrasados > 0 ? '0 0 4px 4px' : '4px',
            }}
          />
        )}
      </div>

      <div>
        <span
          style={{
            ...TIPO.figura, color: sustenta ? T.text : T.mute,
          }}
        >
          {pct}%
        </span>
        <p style={{ ...TIPO.meta, color: T.mute, marginTop: 2 }}>
          dos {total} concluídos saíram dentro do prazo
        </p>
        {atrasados > 0 && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
              color: sustenta ? T.danger : T.faint, ...TIPO.meta,
              fontWeight: sustenta ? W.strong : W.body, ...NUM,
            }}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {atrasados} {atrasados === 1 ? 'fechado atrasado' : 'fechados atrasados'}
          </span>
        )}
        {!sustenta && (
          <p style={{ color: T.faint, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
            poucos chamados para tirar conclusão do percentual
          </p>
        )}
      </div>
    </div>
  );
}

export function AnaliseDeSla({ sla, kpis, periodo, loading }) {
  const [leitura, setLeitura] = useState(LEITURAS[0].key);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton style={{ height: 58 }} />
        <Skeleton style={{ height: 200 }} />
        <Skeleton style={{ height: 44 }} />
      </div>
    );
  }

  const prioridades = sla?.por_prioridade ?? [];
  const minimo = kpis?.amostra?.minimo ?? 5;

  const colunas = prioridades.map((p) => {
    const media = p.media_dias_uteis;
    /**
     * O alerta pede duas coisas: estourar a meta, e ter chamados que bastem.
     *
     * Uma prioridade com dois chamados fechados pode ter "média" de 22 dias
     * porque um deles azedou, e a coluna vermelha diria que a equipe não cumpre
     * prazo de prioridade média. Abaixo do piso a coluna continua na tela, com
     * o número e com o `n` — só não acende.
     */
    const estourou = media !== null && media > p.meta && p.fechados >= minimo;
    const diff = media === null ? null : Math.abs(media - p.meta).toFixed(1).replace('.', ',');

    return {
      id: p.priority,
      valor: media,
      texto: media === null ? null : `${media.toFixed(1).replace('.', ',')} d`,
      referencia: p.meta,
      rotulo: labelOf(PRIORITIES, p.priority),
      // O `n` ao lado da meta, sempre: é ele que diz se a coluna é leitura ou
      // anedota, e é o que faltava para a comparação entre as três ser justa.
      sublinha: `meta ${p.meta} d · ${p.fechados} ${p.fechados === 1 ? 'fechado' : 'fechados'}`,
      /**
       * O veredito, escrito.
       *
       * "9,8 d" não decide nada — é preciso saber de cabeça que a meta da média
       * é 10 e fazer a conta. "0,2 d dentro da meta" decide. A linha tracejada
       * mostra o mesmo, mas mostrar e dizer não competem: quem varre a tela lê
       * a frase, quem quer o tamanho da folga olha a distância até a linha.
       */
      nota:
        media === null
          ? 'nada concluído no período'
          : p.fechados < minimo
            ? `${diff} d ${media > p.meta ? 'acima' : 'abaixo'} da meta — poucos para concluir`
            : `${diff} d ${estourou ? 'acima da meta' : 'dentro da meta'}`,
      alerta: estourou,
      rotuloCompleto: `${labelOf(PRIORITIES, p.priority)} — meta ${p.meta} dias úteis, ${p.fechados} concluídos, ${p.fechados_atrasados} fora do prazo`,
    };
  });

  /**
   * Onde p50, p90 e a meta caem sobre a distribuição.
   *
   * A posição é o índice da faixa em que o valor cai, e não uma regra de três
   * sobre os dias: as faixas têm larguras diferentes — "0-1" cobre dois dias,
   * "11-15" cobre cinco —, e posicionar por dia poria a marca no lugar errado
   * em metade do gráfico. Cada faixa ocupa uma fatia igual do eixo, então a
   * marca vai no meio da faixa a que o valor pertence.
   */
  const faixas = sla?.distribuicao ?? [];
  const posicaoDe = (dias) => {
    if (dias === null || dias === undefined || faixas.length === 0) return null;
    const i = faixas.findIndex((f) => dias <= limiteDaFaixa(f.id));
    const indice = i === -1 ? faixas.length - 1 : i;
    return (indice + 0.5) / faixas.length;
  };

  const marcas = [
    {
      id: 'p50',
      posicao: posicaoDe(kpis?.ciclo_p50_dias_uteis),
      rotulo: `metade fecha até ${umDecimal(kpis?.ciclo_p50_dias_uteis) ?? '—'} d`,
      texto: `${umDecimal(kpis?.ciclo_p50_dias_uteis) ?? '—'} dias úteis`,
    },
    {
      id: 'p90',
      posicao: posicaoDe(kpis?.ciclo_p90_dias_uteis),
      rotulo: `nove em dez fecham até ${umDecimal(kpis?.ciclo_p90_dias_uteis) ?? '—'} d`,
      texto: `${umDecimal(kpis?.ciclo_p90_dias_uteis) ?? '—'} dias úteis`,
      tracejada: true,
    },
  ].filter((m) => m.posicao !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0 }}>
      {/* As duas leituras do prazo lado a lado: quanto cumpriu e quanto demorou.
          São a mesma pergunta por dois ângulos, e separá-las em cartões
          diferentes obrigava a comparar de cabeça. */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}
      >
        <Cumprimento dentro={sla?.dentro ?? 0} atrasados={sla?.atrasados ?? 0} minimo={minimo} />
        <TempoDeCiclo kpis={kpis} base={periodo?.anterior?.toLowerCase() ?? 'o período anterior'} />
      </div>

      {/* As duas leituras de "quanto demorou", uma de cada vez.

          Elas estavam empilhadas, e o cartão ficava com 726px — 44% da altura
          da aba somado ao funil, que esticava junto por causa do `stretch` do
          grid. Empilhá-las também era discutível antes de ser alto: a quebra
          por prioridade e a distribuição respondem quase a mesma pergunta por
          dois ângulos, e ninguém lê as duas de uma vez. Lê-se uma, e a outra
          quando a primeira levanta a dúvida.

          Alternador em vez de corte porque as duas têm dono: a prioridade diz
          *para quem* o prazo não está sendo cumprido, e é o que aciona alguém;
          a distribuição diz a *forma* — se a cauda é grossa ou se são três
          chamados perdidos lá atrás. Jogar uma fora resolveria a altura e
          perderia metade da resposta. */}
      <div
        style={{
          borderTop: `1px solid ${T.line}`, paddingTop: 16,
          display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0,
        }}
      >
        <SeletorInterno
          views={LEITURAS}
          value={leitura}
          onSelect={setLeitura}
          label="Como ler o tempo de resolução"
        />

        {/* As duas leituras ocupam a mesma altura, e é obrigatório.
            Sem o piso comum, o cartão media 491px numa e 425px na outra: cada
            clique no alternador encolhia o cartão, o funil ao lado encolhia
            junto (o grid os iguala) e tudo abaixo subia 66px. Trocar de leitura
            é para olhar o mesmo dado de outro ângulo, não para a página se
            reorganizar embaixo do cursor.

            `minHeight` no contêiner, e não altura fixa nos dois gráficos: eles
            têm pisos internos diferentes, e amarrá-los ao mesmo número faria a
            distribuição esticar suas barras para preencher espaço que ela não
            pediu. */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: ALTURA_DA_LEITURA }}>
          {leitura === 'DISTRIBUICAO' ? (
            <Distribuicao
              faixas={sla?.distribuicao ?? []}
              marcas={marcas}
              medida="Chamados concluídos"
              vazio="Nada fechou no período, então não há tempo de resolução a distribuir."
            />
          ) : (
            <Colunas
              itens={colunas}
              alturaMinima={140}
              medida="Tempo médio em dias úteis"
              rotuloReferencia="Meta da prioridade"
              vazio="Nenhum chamado concluído no período, então não há tempo de resolução a comparar."
            />
          )}
        </div>
      </div>
    </div>
  );
}
