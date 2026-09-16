'use client';
import { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { T, W, NUM } from '@/app/lib/theme';
import { ESPACO, TIPO } from './escala';

/**
 * A anatomia de um número do painel.
 *
 * Os blocos tinham cada um o seu jeito de apresentar o número principal: um
 * punha a variação em texto com seta, outro em linha separada, outro não punha.
 * A figura mudava de tamanho de bloco para bloco, e a forma — quando havia —
 * ficava em lugares diferentes. Cada decisão, sozinha, estava certa; o conjunto
 * parecia montado, e não desenhado.
 *
 * São três peças, e a ordem nunca muda: **figura, variação, forma.**
 *
 * - `Figura` é o número, sempre no mesmo corpo, com o rótulo embaixo.
 * - `PilulaVariacao` é a comparação com o período anterior, em pílula.
 * - `Faixa` é a forma preenchida no pé do cartão.
 *
 * A forma é o que faltava, e é o que mais muda a impressão. Um número sozinho
 * num cartão é um número; o mesmo número com a própria história desenhada atrás
 * dele é uma leitura. Ela não acrescenta dado nenhum que já não esteja na tela
 * — acrescenta a forma do dado, que é o que o olho lê antes de ler o dígito.
 */

/**
 * A variação contra o período anterior, em pílula.
 *
 * Era texto solto com uma seta: `▲ 2,3 d vs. o período anterior`. A pílula faz
 * duas coisas que o texto não fazia — separa a comparação do número (são duas
 * grandezas, e coladas se lêem como uma) e dá à cor uma área onde caber, em vez
 * de tingir uma linha de texto.
 *
 * `bomSubir` existe porque subir nem sempre é bom: mais chamados concluídos é
 * bom, mais dias de resolução não é. Sem isso, a pílula pintaria de verde a
 * piora sempre que o número crescesse.
 *
 * Só o lado ruim recebe cor. O lado bom fica na tinta de apoio — se melhora e
 * piora acendem, a tela inteira vira semáforo e o vermelho para de querer dizer
 * alguma coisa. É a mesma regra do resto do produto.
 */
export function PilulaVariacao({ valor, bomSubir = true, sufixo = '%', base, casas = 0 }) {
  /**
   * Sem período anterior, a pílula continua na tela e diz isso.
   *
   * Sumir seria a tela deixando um buraco onde a comparação mora em todos os
   * outros blocos, e quem lê "11 chamados" sem nada ao lado supõe que não houve
   * mudança — quando o que houve foi não ter com o que comparar. Prédio novo,
   * primeiro ano, filtro que não casou com nada: são todos este caso.
   */
  if (valor === null || valor === undefined) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '3px 8px', borderRadius: 999,
          background: T.chip, color: T.faint,
          ...TIPO.meta, lineHeight: 1.2, whiteSpace: 'nowrap',
        }}
      >
        sem base de comparação
      </span>
    );
  }

  // Quase-zero é estabilidade, não uma variação minúscula: `0,04%` com seta
  // para cima diz que mexeu, e não mexeu.
  const parado = Math.abs(valor) < 0.05;
  const subiu = valor > 0;
  const ruim = !parado && subiu !== bomSubir;

  const texto = parado
    ? 'estável'
    : `${Math.abs(valor).toFixed(casas).replace('.', ',')}${sufixo}`;

  return (
    <span
      title={base ? `${texto} contra ${base}` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '3px 8px', borderRadius: 999,
        background: ruim ? T.dangerSoft : T.chip,
        color: ruim ? T.danger : T.faint,
        ...TIPO.meta, ...NUM,
        fontWeight: W.strong, lineHeight: 1.2, whiteSpace: 'nowrap',
      }}
    >
      {!parado && (
        <span aria-hidden="true" style={{ fontSize: 9 }}>{subiu ? '▲' : '▼'}</span>
      )}
      {texto}
    </span>
  );
}

/**
 * A forma no pé do cartão.
 *
 * SVG, e não os `<div>` de altura percentual que o resto do painel usa para
 * barras: uma área contínua com degradê precisa de um caminho, e empilhar
 * cinquenta divs de 1px para simular curva é o tipo de coisa que funciona na
 * captura de tela e não no navegador de ninguém.
 *
 * `preserveAspectRatio="none"` faz o desenho esticar para a largura do cartão
 * sem eu precisar medir o DOM. A grandeza aqui é a forma — sobe, desce, tem
 * pico no meio —, não o valor exato de cada ponto; para o valor exato existe a
 * tabela do bloco. Distorcer a proporção horizontal não mente sobre nada que
 * esta peça se proponha a dizer.
 *
 * `aria-hidden` porque ela é a mesma série que o bloco já expõe em tabela para
 * quem ouve a tela. Anunciá-la de novo seria ler a mesma coisa duas vezes.
 */
export function Faixa({ valores, cor, altura = 46, area = true }) {
  const id = useId();

  const limpos = (valores ?? []).filter((v) => v !== null && v !== undefined);
  // Dois pontos é o mínimo para haver linha. Com um, não há forma a mostrar.
  if (limpos.length < 2) return null;

  const max = Math.max(...limpos);
  const min = Math.min(...limpos);
  // Série chapada (todo mundo igual) desenha no meio, e não colada no topo.
  const amplitude = max - min || 1;

  const L = 100;
  const A = 30;
  const pontos = limpos.map((v, i) => {
    const x = (i / (limpos.length - 1)) * L;
    const y = A - ((v - min) / amplitude) * A;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linha = `M ${pontos.join(' L ')}`;
  const preenchimento = `${linha} L ${L},${A} L 0,${A} Z`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height: altura, overflow: 'visible' }}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={`faixa-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity="0.32" />
              <stop offset="100%" stopColor={cor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={preenchimento} fill={`url(#faixa-${id})`} />
        </>
      )}
      <path
        d={linha}
        fill="none"
        stroke={cor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        // Sem isto a linha afina no topo e engorda embaixo, porque o viewBox é
        // esticado na horizontal e a espessura do traço estica junto.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * O número principal de um bloco, com o rótulo e a variação.
 *
 * Um corpo só para a figura em toda a tela — o painel tinha 48, 30, 26, 24 e
 * 22 espalhados, cada um escolhido no seu dia. Comparar dois números de blocos
 * vizinhos exige que eles tenham o mesmo tamanho; com corpos diferentes, o
 * maior parece mais importante sem ninguém ter decidido isso.
 */
export function Figura({ valor, rotulo, variacao, alerta = false, sufixo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: ESPACO.sm, flexWrap: 'wrap' }}>
        <span
          style={{
            ...TIPO.heroi, ...NUM,
            color: alerta ? T.danger : T.text,
            lineHeight: 1, whiteSpace: 'nowrap',
          }}
        >
          {valor}
          {sufixo && (
            <span style={{ ...TIPO.titulo, color: T.faint, fontWeight: W.body }}> {sufixo}</span>
          )}
        </span>
        {variacao}
      </div>
      {rotulo && <span style={{ ...TIPO.meta, color: T.mute }}>{rotulo}</span>}
    </div>
  );
}

/**
 * Uma célula de apoio: rótulo miúdo, número médio, nota embaixo.
 *
 * É o degrau abaixo da `Figura` — serve às três ou quatro medidas que
 * acompanham o número principal sem disputar com ele. A barra fina sob o número
 * é opcional e mostra proporção quando há um todo a que ela pertença; sem
 * `proporcao`, a célula é só texto.
 */
export function Celula({ icone: Icone, rotulo, valor, sufixo, nota, alerta = false, proporcao, cor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {Icone && <Icone size={12} aria-hidden="true" style={{ flexShrink: 0 }} />}
        {rotulo}
      </span>

      <span
        style={{
          ...TIPO.figura, ...NUM,
          color: alerta ? T.danger : T.text,
          fontWeight: W.title, lineHeight: 1.15, whiteSpace: 'nowrap',
        }}
      >
        {valor}
        {sufixo && (
          <span style={{ ...TIPO.meta, color: T.faint, fontWeight: W.body }}> {sufixo}</span>
        )}
      </span>

      {proporcao !== null && proporcao !== undefined && (
        <span
          aria-hidden="true"
          style={{ display: 'block', height: 3, borderRadius: 2, background: T.chip, overflow: 'hidden' }}
        >
          <span
            style={{
              display: 'block', height: '100%', borderRadius: 2,
              width: `${Math.min(100, Math.max(0, proporcao * 100))}%`,
              background: alerta ? T.danger : cor ?? T.mute,
              transition: 'width 320ms var(--ease-saida)',
            }}
          />
        </span>
      )}

      {/* O triângulo na nota, e não só a cor no número.
          Quem não distingue vermelho de cinza perde o alarme inteiro se ele
          mora só na tinta. O ícone vai na explicação, e não ao lado do número,
          porque colado ao dígito ele disputa espaço com a unidade e empurra o
          valor para a segunda linha em célula estreita. */}
      {nota && (
        <span style={{ ...TIPO.meta, color: alerta ? T.danger : T.faint }}>
          {alerta && (
            <AlertTriangle
              size={11}
              aria-hidden="true"
              style={{ marginRight: 4, verticalAlign: -1 }}
            />
          )}
          {nota}
        </span>
      )}
    </div>
  );
}
