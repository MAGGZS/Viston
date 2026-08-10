'use client';
import { useState } from 'react';
import { T, R, W } from '@/app/lib/theme';

/**
 * Quadradinho de um dia no calendário.
 * No hover, abre um balão logo abaixo com quem fez as vistorias do dia.
 * No clique, entrega o dia para o pai abrir o modal de detalhes.
 */
export function CalendarDayCell({ dayNumber, dayKey, info, background, size, onClick }) {
  const [hover, setHover] = useState(false);
  const count = info?.count ?? 0;
  const hasData = count > 0;

  const boxStyle = size
    ? { width: size, height: size }
    : { aspectRatio: '1', width: '100%', minWidth: 0 };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onMouseEnter={() => hasData && setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => hasData && onClick?.(dayKey, info)}
        style={{
          ...boxStyle,
          borderRadius: 5,
          background,
          cursor: hasData ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s',
          transform: hover ? 'scale(1.12)' : 'scale(1)',
        }}
      >
        <span style={{ fontSize: 11, color: count >= 4 ? T.onAccent : 'rgba(255,255,255,0.44)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dayNumber}</span>
      </div>

      {hover && hasData && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            minWidth: 168,
            maxWidth: 240,
            background: T.chip,
            borderRadius: R.pill,
            padding: '11px 13px',
            pointerEvents: 'none',
          }}
        >
          <p style={{ color: T.accent, fontSize: 11, fontWeight: W.strong, marginBottom: 6 }}>
            {count} vistoria{count !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(info.inspectors ?? []).map((name, i) => (
              <span key={i} style={{ color: T.text, fontSize: 11, lineHeight: 1.4 }}>{name}</span>
            ))}
          </div>
          <p style={{ color: T.faint, fontSize: 11, marginTop: 6 }}>Clique para ver o relatório</p>
        </div>
      )}
    </div>
  );
}
