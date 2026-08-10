'use client';
import { Logo } from '@/app/components/Logo';
import { T, W } from '@/app/lib/theme';

/** Casca das telas de acesso: coluna única centralizada na página. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center' }}>
          <Logo size={52} />

          <h1 style={{
            fontFamily: T.display, fontWeight: W.title, fontSize: 26,
            color: T.text, letterSpacing: '-0.015em', marginTop: 26,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: T.mute, fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{subtitle}</p>
          )}
        </div>

        <div style={{ height: 1, background: T.line, margin: '26px 0' }} />

        {children}

        {footer && <div style={{ marginTop: 26, textAlign: 'center' }}>{footer}</div>}
      </div>
    </div>
  );
}
