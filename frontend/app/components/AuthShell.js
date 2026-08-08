'use client';
import { Logo } from '@/app/components/Logo';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const HAIRLINE = 'rgba(255,255,255,0.08)';

/** Casca das telas de acesso: coluna única centralizada na página. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A11',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center' }}>
          <Logo size={52} />

          <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginTop: 28 }}>
            Acesso
          </p>
          <h1 style={{
            fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 900, fontSize: 32,
            color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.01em', marginTop: 8,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{subtitle}</p>
          )}
        </div>

        <div style={{ height: 1, background: HAIRLINE, margin: '28px 0' }} />

        {children}

        {footer && <div style={{ marginTop: 28, textAlign: 'center' }}>{footer}</div>}
      </div>
    </div>
  );
}
