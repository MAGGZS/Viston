/**
 * Tokens visuais do produto inteiro — desktop e mobile bebem daqui.
 *
 * O valor não mora mais neste arquivo: cada chave aponta para uma variável CSS
 * declarada em app/globals.css, que tem dois conjuntos, um por tema. Este
 * arquivo continua sendo o vocabulário — quem escreve interface pede `T.card` e
 * não precisa saber que existe modo claro.
 *
 * Superfície é sempre cor sólida: três níveis (página, cartão, chip) já separam
 * o conteúdo, então borda só entra onde algo precisa ser dividido de fato. No
 * claro, onde a diferença de luminância entre cartão branco e página quase
 * some, esse papel é do `cardRing`.
 * Dourado é reservado à ação primária e ao estado ativo; usá-lo em mais lugares
 * tira dele justamente o que faz ele funcionar.
 */

/**
 * Os dois temas, o nome da chave e a cor da barra do sistema.
 *
 * Moram neste arquivo, e não em app/lib/tema.js, porque app/layout.js é
 * componente de servidor e precisa do `THEME_KEY` para montar o script que roda
 * antes da primeira pintura. tema.js exporta hooks, então é `'use client'`, e
 * o Next recusa um módulo assim no grafo do servidor — mesmo para ler uma
 * string. Aqui não há hook nenhum, e os dois lados leem o mesmo valor.
 */
export const THEME_KEY = 'viston:tema';

export const THEMES = ['dark', 'light'];

/** Cor da barra do sistema no telefone. Acompanha --color-page de cada tema. */
export const THEME_COLOR = { dark: '#0B0B0B', light: '#F5F6F8' };

export const T = {
  bg: 'var(--color-page)',
  card: 'var(--color-card)',
  chip: 'var(--color-chip)',
  line: 'var(--color-line)',
  accent: 'var(--color-accent)',
  accentSoft: 'var(--color-accent-soft)',
  /**
   * Dourado quando ele é letra ou ícone, e não fundo.
   *
   * No escuro é o mesmo `accent`. No claro ele escurece para #8A6B00, porque
   * #F5C518 sobre branco dá 1,7:1 e some. Regra: `background` usa `accent`,
   * `color` usa `accentInk`.
   */
  accentInk: 'var(--color-accent-ink)',
  /** Texto sobre dourado. Preto puro dá 12,6:1 — nenhum tom rebaixado chega perto. */
  onAccent: '#000',
  text: 'var(--color-ink)',
  /**
   * Texto secundário — e secundário não quer dizer opcional.
   *
   * `mute` carrega o e-mail da conta, a dica de cada linha do perfil, o nome do
   * inspetor e a data no formulário de vistoria: informação que alguém precisa
   * ler. A 0,44 ele dava ~3,6:1 sobre o cartão, abaixo dos 4,5:1 que a WCAG
   * pede para texto. A 0,68 dá ~8,4:1, e continua sendo claramente o segundo
   * nível de leitura. No claro, 0,64 sobre branco dá ~6,7:1.
   */
  mute: 'var(--color-mute)',
  /**
   * O nível mais apagado, e o único com regra de uso: separador, marca d'água,
   * rótulo de apoio. Nunca texto que alguém precise ler de fato — para isso
   * existe `mute`. Passa em 4,5:1 nos dois temas mesmo assim, porque "de apoio"
   * costuma virar "importante" com o tempo.
   */
  faint: 'var(--color-faint)',
  /** Confirmação ("recebido", "solicitação enviada"), fora da escala do dourado. */
  success: 'var(--color-success)',
  /** Terceira cor, só para separar contagens em gráfico de apoio. */
  info: 'var(--color-info)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  /**
   * O fio que separa cartão de fundo no modo claro, e nada no escuro.
   *
   * Vai em `boxShadow`, não em `border`: metade dos cartões é `<button>` com
   * `border: none`, e uma borda de verdade empurraria o layout em 1px só num
   * dos temas.
   */
  cardRing: 'var(--card-ring)',
  /** Superfície sob o cursor, um passo acima da cor de base. */
  hover: 'var(--color-hover)',
  display: 'var(--font-poppins), sans-serif',
};

/**
 * Rampa do calendário de atividade, do dia vazio ao dia cheio.
 *
 * Existia copiada em quatro telas, cada uma com a sua função `heatColor`. Uma
 * cópia só bastava para as duas escalas (a legenda e a célula) discordarem, e
 * no modo claro a rampa muda de direção: ela clareia em vez de escurecer.
 */
export const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];

/** Cor do dia conforme a contagem. Quatro vistorias ou mais saturam a rampa. */
export function heatColor(count) {
  return HEAT[Math.min(count || 0, 4)];
}

/**
 * A rampa dos gráficos do painel do moderador.
 *
 * Uma matiz só, cinco degraus, do começo do caminho do chamado ao fim: estado
 * de chamado é etapa de funil, e etapa se lê melhor numa escala do que em cinco
 * cores diferentes — a ordem fica visível na própria cor. Cinco cores
 * categóricas diriam "estas coisas são diferentes"; a rampa diz "esta vem
 * depois daquela", que é o que a pizza mostra.
 *
 * Dourado porque era o que o calendário de atividade já gastava neste lugar da
 * tela — a pizza tomou o lugar dele, e com ele a licença de usar a rampa. Fora
 * daqui a regra continua valendo: dourado é ação primária e estado ativo.
 *
 * Os degraus vivem em app/globals.css, um conjunto por tema, e passaram no
 * validador de rampa ordinal nos dois. `MARK` é a cor única das barras de
 * categoria — lá o comprimento já diz o tamanho, e pintar cada barra de uma cor
 * gastaria o canal da identidade com o que a barra mostra sozinha.
 */
export const CHART = ['var(--chart-0)', 'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

export const CHART_MARK = 'var(--chart-mark)';

/**
 * Escala de raio.
 *
 * A superfície tem canto curto e o controle tem canto generoso — o contrário do
 * "quanto maior a área, maior o raio" de antes, e é de propósito. Com 26px o
 * cartão puxava o olho para a moldura antes do número que ele carrega, e a
 * fileira de contadores parecia um carrossel de pílulas; em 12px a borda vira o
 * que ela é, o limite da superfície. Botão, campo e lista suspensa ficaram como
 * sempre foram: são as peças que a mão procura, e o canto redondo é parte de
 * como elas se anunciam.
 *
 * O efeito colateral aceito é o botão de 16px dentro de um cartão de 12: o canto
 * de dentro fica mais redondo que o de fora. Foi olhado e mantido.
 *
 * Estes três valores existem em dois lugares — aqui e no bloco gêmeo do
 * @theme em app/globals.css, que é de onde saem as classes do Tailwind.
 */
export const R = {
  card: 12,
  control: 16,
  pill: 12,
  badge: 999,
};

/**
 * Pesos por papel. Uma família só, então a hierarquia inteira sai daqui —
 * 900 é exclusivo do wordmark.
 */
export const W = {
  wordmark: 900,
  title: 600,
  strong: 500,
  body: 400,
};

/**
 * Números que precisam alinhar em coluna ou comparar de relance.
 * Poppins é geométrica e seus dígitos afinam; o tracking compensa.
 */
export const NUM = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
};

/**
 * Único cartão com gradiente no produto: a credencial do perfil.
 * Cinco pontos de luminância dão volume sem virar ornamento.
 */
export const HERO_SURFACE = 'var(--hero-surface)';
