import { ImageResponse } from 'next/og';
import { BRAND } from '@/app/lib/site';

// Ícone da tela de início no iOS — mesmo "V" do favicon, sem cantos arredondados
// (o próprio iOS aplica a máscara).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.accent,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64">
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
    ),
    size
  );
}
