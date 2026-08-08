'use client';

/**
 * Logo do projeto: a palavra VISTON em Poppins Black, branca.
 * `size` é o tamanho da fonte em px.
 * Poppins para no peso 900, então o traço ganha corpo com um contorno
 * da mesma cor, proporcional ao tamanho (`weight` ajusta a espessura).
 */
export function Logo({ size = 20, weight = 0.05, style = {} }) {
  const stroke = size * weight;

  return (
    <span
      style={{
        fontFamily: 'var(--font-poppins), sans-serif',
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '0.04em',
        color: '#FFFFFF',
        WebkitTextStroke: `${stroke}px #FFFFFF`,
        paintOrder: 'stroke fill',
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
    >
      VISTON
    </span>
  );
}
