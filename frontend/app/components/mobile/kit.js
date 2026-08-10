'use client';
import { T } from '@/app/lib/theme';

/**
 * Componentes das telas mobile.
 *
 * As cores vieram daqui originalmente e hoje valem para o produto inteiro:
 * moram em app/lib/theme.js. `M` continua exportado porque as telas mobile
 * o usam em dezenas de lugares.
 */

export const M = T;

/** Tela: fundo preto e espaço para a barra inferior. */
export function MPage({ children, pad = true }) {
  return (
    <div style={{ minHeight: '100vh', background: M.bg, paddingBottom: 108 }}>
      <div style={{ padding: pad ? '0 16px' : 0 }}>{children}</div>
    </div>
  );
}

/** Barra do topo: título grande à esquerda, botões redondos à direita. */
export function MTopBar({ eyebrow, title, accent, actions, avatar }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '52px 0 22px' }}>
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <p style={{ color: M.faint, fontSize: 12, marginBottom: 2 }}>{eyebrow}</p>}
        <h1 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 22, color: M.text, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          {title}{accent && <span style={{ color: M.accent }}> {accent}</span>}
        </h1>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </header>
  );
}

/** Botão redondo de ícone, como os do topo da referência. */
export function MRound({ children, onClick, active = false, label }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer',
      background: active ? M.accent : M.chip,
      color: active ? '#000' : M.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

/** Cartão base. */
export function MCard({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: M.card, borderRadius: 26, padding: 18,
      ...(onClick ? { cursor: 'pointer' } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Trio de números dentro do cartão. */
export function MStats({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8 }}>
      {items.map(({ value, label }) => (
        <div key={label} style={{ background: M.chip, borderRadius: 16, padding: '12px 8px', textAlign: 'center' }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 17, color: M.text, lineHeight: 1.1 }}>{value}</p>
          <p style={{ color: M.mute, fontSize: 11, marginTop: 3 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

const BUTTON_BASE = {
  border: 'none', cursor: 'pointer', borderRadius: 16, padding: '14px 18px',
  fontFamily: M.display, fontWeight: 600, fontSize: 14,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};

/** Ação principal: amarelo sólido. */
export function MButton({ children, onClick, type = 'button', disabled, loading, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...BUTTON_BASE, background: M.accent, color: '#000', opacity: disabled || loading ? 0.5 : 1, ...style }}>
      {loading ? 'Aguarde...' : children}
    </button>
  );
}

/** Ação secundária: amarelo rebaixado. */
export function MButtonSoft({ children, onClick, type = 'button', disabled, loading, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      style={{ ...BUTTON_BASE, background: M.accentSoft, color: M.accent, opacity: disabled || loading ? 0.5 : 1, ...style }}>
      {loading ? 'Aguarde...' : children}
    </button>
  );
}

/** Ação neutra ou destrutiva: cinza chapado. */
export function MButtonGhost({ children, onClick, type = 'button', tone = 'neutral', disabled, style = {} }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...BUTTON_BASE, background: M.chip, color: tone === 'danger' ? M.danger : M.text, opacity: disabled ? 0.5 : 1, ...style }}>
      {children}
    </button>
  );
}

/** Rótulo de seção: texto claro à esquerda, ação em pílula amarela à direita. */
export function MSectionHead({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '26px 0 12px' }}>
      <h2 style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>{title}</h2>
      {action}
    </div>
  );
}

/** Pílula amarela usada ao lado dos títulos de seção. */
export function MPill({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: M.accent, color: '#000', border: 'none', cursor: 'pointer',
      borderRadius: 12, padding: '7px 14px', fontFamily: M.display, fontWeight: 600, fontSize: 13,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </button>
  );
}

/** Campo de texto do mobile. */
export function MField({ label, error, style = {}, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {label && <span style={{ color: M.mute, fontSize: 12 }}>{label}</span>}
      <input
        style={{
          background: M.chip, border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'transparent'}`,
          borderRadius: 16, padding: '14px 16px', color: M.text, fontSize: 15, outline: 'none', width: '100%',
          ...style,
        }}
        {...props}
      />
      {error && <span style={{ color: M.danger, fontSize: 12 }}>{error}</span>}
    </label>
  );
}

/** Lista suspensa do formulário de vistoria. */
export function MSelect({ label, error, options = [], ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {label && <span style={{ color: M.mute, fontSize: 12 }}>{label}</span>}
      <select
        style={{
          background: M.chip, border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'transparent'}`,
          borderRadius: 16, padding: '14px 16px', color: M.text, fontSize: 15, outline: 'none', width: '100%',
          appearance: 'none',
        }}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>
        ))}
      </select>
      {error && <span style={{ color: M.danger, fontSize: 12 }}>{error}</span>}
    </label>
  );
}
