import { ImageResponse } from 'next/og';
import { BRAND, SITE_DESCRIPTION } from '@/app/lib/site';

// Cartão de compartilhamento (WhatsApp, LinkedIn, Slack...). Gerado no build,
// então não depende de nenhum asset externo.

// A marca do arquivo do Figma, embutida: o satori não lê arquivo do disco, e o
// cartão é gerado no build — nada aqui pode depender de rede.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280.746 230" fill="none">` +
  `<path d="M201.889 196.778L153.333 99.6667L191.667 117.556L280.746 0L201.889 196.778Z" fill="#F5C518"/>` +
  `<path d="M204.444 230H124.764L28.1111 35.9211L0 0H94.8832L204.444 230Z" fill="url(#v)"/>` +
  `<defs><linearGradient id="v" x1="102.222" y1="38.3333" x2="155.889" y2="388.444" gradientUnits="userSpaceOnUse">` +
  `<stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#BFBFBF"/></linearGradient></defs></svg>`;

const MARK_SRC = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <img src={MARK_SRC} width={134} height={110} alt="" />
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
