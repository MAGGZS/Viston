'use client';
import { Logo } from '@/app/components/Logo';
import { T, W } from '@/app/lib/theme';

/**
 * Casca das telas de acesso: coluna única centralizada na página.
 *
 * A entrada é escalonada de cima para baixo — marca, título, campos, rodapé —,
 * que é a ordem em que a tela é lida. É a primeira coisa que o produto mostra a
 * quem chega, e antes ela aparecia de uma vez, seca.
 */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center' }}>
          {/* A marca é o único elemento que salta: é o que identifica a tela.
              A logo é um <svg> de bloco, então centraliza por flex — o
              `text-align` da coluna não a alcança. */}
          <div className="anim-pop-in" style={{ display: 'flex', justifyContent: 'center' }}>
            <Logo size={40} variant="stacked" />
          </div>

          <h1 className="anim-fade-up anim-d1" style={{
            fontFamily: T.display, fontWeight: W.title, fontSize: 26,
            color: T.text, letterSpacing: '-0.015em', marginTop: 26,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="anim-fade-in anim-d2" style={{ height: 1, background: T.line, margin: '26px 0' }} />

        <div className="anim-fade-up anim-d3">{children}</div>

        {footer && (
          <div className="anim-fade-up anim-d4" style={{ marginTop: 26, textAlign: 'center' }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
