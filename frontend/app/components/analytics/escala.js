import { T, W } from '@/app/lib/theme';

/**
 * A escala do painel analítico.
 *
 * Existe porque a tela cresceu sem ela. Contando os tamanhos espalhados pelos
 * blocos havia treze: 9, 10, 11, 12, 13, 14, 15, 18, 22, 24, 26, 30 e 48. Treze
 * tamanhos não é uma escala, é o acúmulo de decisões tomadas uma de cada vez —
 * e é exatamente o que faz uma tela parecer montada às pressas mesmo quando
 * cada peça, sozinha, está certa. O olho não lê "15px"; lê que dois títulos que
 * deveriam ser irmãos não são.
 *
 * São sete degraus, cada um com um trabalho. Nenhum tamanho fora deles.
 *
 * Isto não substitui `lib/theme.js` — cor, raio e peso continuam vindo de lá. É
 * a camada de ritmo desta superfície, que é a única do produto com densidade de
 * painel: sete blocos por tela, cada um com número grande, rótulo, explicação e
 * nota de rodapé.
 */

export const TIPO = {
  /** O rótulo em caixa alta que nomeia um grupo. Sempre este espaçamento. */
  eyebrow: {
    fontSize: 10,
    fontWeight: W.strong,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.faint,
  },

  /** O rótulo curto de uma célula — caixa alta, mas dentro de um grupo. */
  cabecalho: {
    fontSize: 10,
    fontWeight: W.strong,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: T.faint,
  },

  /** Nota de rodapé, unidade, explicação de um número. */
  meta: { fontSize: 11, lineHeight: 1.45 },

  /** O texto corrente da tela: frases, células de tabela, itens de lista. */
  corpo: { fontSize: 13, lineHeight: 1.5 },

  /** O título de um cartão. */
  titulo: { fontSize: 14, fontWeight: W.title },

  /** O nome de uma pessoa, de um andar — o que abre uma análise. */
  secao: { fontSize: 18, fontWeight: W.title, letterSpacing: '-0.01em' },

  /**
   * Um número que se lê de longe.
   *
   * Figuras proporcionais, e não `tabular-nums`: tabular dá a todo dígito a
   * largura do zero, e acima de 20px isso abre buracos dentro do próprio
   * número. Tabular fica para colunas que precisam alinhar entre linhas.
   */
  figura: {
    fontFamily: T.display,
    fontSize: 22,
    fontWeight: W.title,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
  },

  /** O número que o cartão lidera. Um por bloco, no máximo. */
  heroi: {
    fontFamily: T.display,
    fontSize: 40,
    fontWeight: W.title,
    lineHeight: 1,
    letterSpacing: '-0.03em',
  },
};

/**
 * O ritmo vertical: múltiplos de quatro, e só estes.
 *
 * Os vãos estavam em 3, 4, 6, 8, 10, 12, 14, 16, 18, 20 e 22. A grade de quatro
 * não é rigor por rigor: ela é o que faz dois blocos diferentes respirarem
 * igual sem ninguém medir nada.
 *
 * Geometria de gráfico fica de fora — o vão de 6px entre colunas e o de 2px
 * entre fatias são medidas do dado, não do leiaute, e arredondá-las mudaria o
 * desenho para acertar uma regra que não é sobre ele.
 */
export const ESPACO = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/**
 * A etiqueta que diz de que relógio o número veio.
 *
 * É a peça que esta tela repete de propósito. Metade das perguntas do painel é
 * sobre um período escolhido e a outra metade é sobre agora, e os dois tipos de
 * número convivem no mesmo cartão — o funil mede o mês e conta os parados de
 * hoje; o SLA mede o mês e lista o que vai estourar amanhã. Sem dizer qual é
 * qual, quem lê soma um com o outro e tira a conclusão errada.
 *
 * Então todo bloco declara o relógio dele, sempre no mesmo lugar e com a mesma
 * forma. É a única decoração da tela que carrega informação.
 */
export function Relogio({ children, agora = false }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: ESPACO.xs,
        flexShrink: 0,
        // Sem dourado, nem no caso "agora". O destaque desta tela pertence ao
        // gargalo do funil, e uma etiqueta de metadado repetida em sete
        // cabeçalhos gastaria a mesma tinta dizendo bem menos. A diferença
        // entre os dois estados é de contraste, não de cor.
        background: T.chip,
        color: agora ? T.mute : T.faint,
        // Anel em vez de só fundo: a etiqueta passa a ter a silhueta de um
        // controle, que é o que ela ocupa no cabeçalho — canto superior
        // direito, ao lado do título. Sem o anel ela some no cartão e o
        // cabeçalho fica com o título flutuando sozinho.
        boxShadow: `inset 0 0 0 1px ${T.line}`,
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: W.strong,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
