/**
 * Tokens visuais do produto inteiro — desktop e mobile bebem daqui.
 *
 * Superfície é sempre cor sólida: três níveis (página, cartão, chip) já separam
 * o conteúdo, então borda só entra onde algo precisa ser dividido de fato.
 * Dourado é reservado à ação primária e ao estado ativo; usá-lo em mais lugares
 * tira dele justamente o que faz ele funcionar.
 */
export const T = {
  bg: '#0B0B0B',
  card: '#171717',
  chip: '#232323',
  line: 'rgba(255,255,255,0.07)',
  accent: '#F5C518',
  accentSoft: 'rgba(245,197,24,0.13)',
  /** Texto sobre dourado. Preto puro dá 12,6:1 — nenhum tom rebaixado chega perto. */
  onAccent: '#000',
  text: 'rgba(255,255,255,0.96)',
  /**
   * Texto secundário — e secundário não quer dizer opcional.
   *
   * `mute` carrega o e-mail da conta, a dica de cada linha do perfil, o nome do
   * inspetor e a data no formulário de vistoria: informação que alguém precisa
   * ler. A 0,44 ele dava ~3,6:1 sobre o cartão, abaixo dos 4,5:1 que a WCAG
   * pede para texto. A 0,68 dá ~8,4:1, e continua sendo claramente o segundo
   * nível de leitura.
   */
  mute: 'rgba(255,255,255,0.68)',
  /**
   * O nível mais apagado, e o único com regra de uso: separador, marca d'água,
   * rótulo de apoio. Nunca texto que alguém precise ler de fato — para isso
   * existe `mute`. A 0,52 ele passa em 4,5:1 mesmo assim, porque "de apoio"
   * costuma virar "importante" com o tempo.
   */
  faint: 'rgba(255,255,255,0.52)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.13)',
  display: 'var(--font-poppins), sans-serif',
};

/** Escala de raio: quanto maior a superfície, mais generoso o canto. */
export const R = {
  card: 26,
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
export const HERO_SURFACE = 'linear-gradient(158deg, #1A1A1A 0%, #151515 100%)';
