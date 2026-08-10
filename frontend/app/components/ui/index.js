'use client';
import { T, R, W } from '@/app/lib/theme';

/**
 * Componentes compartilhados por desktop e mobile.
 * Superfície chapada: os três níveis de cor já separam o conteúdo, então
 * nenhum destes elementos carrega borda, blur ou sombra decorativa.
 */
const G = {
  card: { background: T.card, borderRadius: R.card },
  input: {
    background: T.chip,
    border: '1px solid transparent',
    borderRadius: R.control,
    padding: '13px 15px',
    color: T.text,
    fontSize: 15,
    fontWeight: W.body,
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s',
  },
  inputError: { borderColor: 'rgba(248,113,113,0.5)' },
  label: { fontSize: 11, fontWeight: W.body, color: T.mute },
};

export function Button({ children, variant = 'primary', className = '', loading = false, style = {}, ...props }) {
  const styles = {
    primary: { background: T.accent, color: T.onAccent, hover: '#FFD230' },
    secondary: { background: T.chip, color: T.text, hover: '#2E2E2E' },
    ghost: { background: 'transparent', color: T.mute, hover: T.chip },
    danger: { background: T.dangerSoft, color: T.danger, hover: 'rgba(248,113,113,0.2)' },
  };
  const { hover, ...base } = styles[variant];
  const idle = base.background;

  return (
    <button
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: T.display, fontWeight: W.strong, fontSize: 14,
        padding: '12px 20px', borderRadius: R.control, border: 'none',
        cursor: props.disabled || loading ? 'not-allowed' : 'pointer',
        opacity: props.disabled || loading ? 0.5 : 1,
        transition: 'background-color 0.15s ease, opacity 0.2s',
        ...base,
        ...style,
      }}
      onMouseEnter={e => { if (!props.disabled && !loading) e.currentTarget.style.background = hover; }}
      onMouseLeave={e => { e.currentTarget.style.background = style.background ?? idle; }}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

export function Input({ label, error, style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={G.label}>{label}</label>}
      <input style={{ ...G.input, ...(error ? G.inputError : {}), ...style }} {...props} />
      {error && <span style={{ fontSize: 12, color: T.danger }}>{error}</span>}
    </div>
  );
}

export function Card({ children, style = {}, className = '' }) {
  return (
    <div style={{ ...G.card, padding: 20, ...style }} className={`anim-fade-up ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 16, md: 24, lg: 40 }[size];
  return (
    <div style={{ width: s, height: s, border: `2px solid ${T.accentSoft}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );
}

export function Badge({ children, variant = 'default', className = '' }) {
  const colors = {
    default: { background: T.chip, color: T.text },
    success: { background: T.chip, color: T.text },
    warning: { background: T.accentSoft, color: T.accent },
    danger: { background: T.chip, color: T.danger },
    accent: { background: T.accentSoft, color: T.accent },
  };
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: R.badge, fontSize: 11, fontWeight: W.body, ...colors[variant] }}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ position: 'relative', width: 44, height: 24, borderRadius: R.badge, transition: 'background 0.2s', background: checked ? T.accent : T.chip, flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: checked ? '#000' : T.text, borderRadius: '50%', transition: 'left 0.2s' }} />
      </div>
      {label && <span style={{ color: T.text, fontSize: 14 }}>{label}</span>}
    </label>
  );
}

export function Skeleton({ className = '', style = {} }) {
  return <div style={{ background: `linear-gradient(90deg, ${T.chip} 25%, #2E2E2E 50%, ${T.chip} 75%)`, backgroundSize: '200% 100%', borderRadius: R.control, animation: 'shimmer 1.4s ease-in-out infinite', ...style }} className={className} />;
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fade-in 0.2s ease both' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div className="anim-scale-in" style={{ position: 'relative', background: T.card, borderRadius: R.card, padding: 22, width: '100%', maxWidth: 400 }}>
        {title && <h2 style={{ fontFamily: T.display, fontSize: 15, fontWeight: W.title, color: T.text, marginBottom: 16 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Select({ label, error, options = [], style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={G.label}>{label}</label>}
      <select style={{ ...G.input, appearance: 'none', ...style }} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: T.card }}>{opt.label}</option>
        ))}
      </select>
      {error && <span style={{ fontSize: 12, color: T.danger }}>{error}</span>}
    </div>
  );
}
