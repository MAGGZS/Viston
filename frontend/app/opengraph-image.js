import { ImageResponse } from 'next/og';
import { BRAND, SITE_DESCRIPTION } from '@/app/lib/site';

// Cartão de compartilhamento (WhatsApp, LinkedIn, Slack...). Gerado no build,
// então não depende de nenhum asset externo.
export const alt = 'Viston — Sistema de Vistoria Predial';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: BRAND.background,
          backgroundImage: `radial-gradient(circle at 12% 8%, rgba(245,197,24,0.18) 0%, transparent 55%), radial-gradient(circle at 88% 92%, rgba(100,80,200,0.16) 0%, transparent 55%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: BRAND.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="96" height="96" viewBox="0 0 64 64">
              <path
                d="M16 19 L32 45 L48 19"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="miter"
                strokeMiterlimit="4"
              />
            </svg>
          </div>
          <div style={{ fontSize: 92, fontWeight: 800, color: BRAND.foreground, letterSpacing: '0.02em' }}>
            VISTON
          </div>
        </div>

        <div style={{ marginTop: 44, fontSize: 40, lineHeight: 1.35, color: 'rgba(255,255,255,0.72)' }}>
          {SITE_DESCRIPTION}
        </div>

        <div style={{ marginTop: 52, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 6, borderRadius: 3, background: BRAND.accent }} />
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.14em' }}>
            VISTORIA PREDIAL
          </div>
        </div>
      </div>
    ),
    size
  );
}
