'use client';

const G = {
  card: { background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24 },
  input: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: '14px 16px', color: 'rgba(255,255,255,0.9)', fontSize: 15, outline: 'none', width: '100%', transition: 'border-color 0.2s' },
  inputError: { borderColor: 'rgba(239,68,68,0.5)' },
  label: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' },
};

export function Button({ children, variant = 'primary', className = '', loading = false, style = {}, ...props }) {
  const styles = {
    primary: { background: '#F5C518', color: '#000', boxShadow: '0 0 20px rgba(245,197,24,0.25)' },
    secondary: { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' },
    ghost: { background: 'transparent', color: 'rgba(255,255,255,0.4)' },
    danger: { background: 'rgba(239,68,68,0.12)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.25)' },
  };
  return (
    <button
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 600, fontSize: 14, padding: '12px 20px', borderRadius: 16, border: 'none', cursor: props.disabled || loading ? 'not-allowed' : 'pointer', opacity: props.disabled || loading ? 0.5 : 1, transition: 'all 0.2s', ...styles[variant], ...style }}
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
      {error && <span style={{ fontSize: 12, color: 'rgba(248,113,113,0.9)' }}>{error}</span>}
    </div>
  );
}

export function Card({ children, style = {}, className = '' }) {
  return (
    <div style={{ ...G.card, padding: 20, ...style }} className={className}>
      {children}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 16, md: 24, lg: 40 }[size];
  return (
    <div style={{ width: s, height: s, border: `2px solid rgba(245,197,24,0.3)`, borderTopColor: '#F5C518', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  );
}

export function Badge({ children, variant = 'default', className = '' }) {
  const colors = {
    default: { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' },
    success: { background: 'rgba(34,197,94,0.1)', color: 'rgb(74,222,128)', border: '1px solid rgba(34,197,94,0.2)' },
    warning: { background: 'rgba(245,158,11,0.1)', color: 'rgb(251,191,36)', border: '1px solid rgba(245,158,11,0.2)' },
    danger: { background: 'rgba(239,68,68,0.1)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.2)' },
    accent: { background: 'rgba(245,197,24,0.1)', color: '#F5C518', border: '1px solid rgba(245,197,24,0.2)' },
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 500, ...colors[variant] }}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, transition: 'all 0.3s', background: checked ? '#F5C518' : 'rgba(255,255,255,0.1)', boxShadow: checked ? '0 0 12px rgba(245,197,24,0.4)' : 'none', flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
      </div>
      {label && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{label}</span>}
    </label>
  );
}

export function StatusBadge({ synced }) {
  return synced
    ? <Badge variant="success">✓ Sincronizado</Badge>
    : <Badge variant="warning">⏳ Pendente</Badge>;
}

export function Skeleton({ className = '', style = {} }) {
  return <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite', ...style }} className={className} />;
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        {title && <h2 style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 20 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Select({ label, error, options = [], style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={G.label}>{label}</label>}
      <select style={{ ...G.input, ...style }} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: '#0e0e1a' }}>{opt.label}</option>
        ))}
      </select>
      {error && <span style={{ fontSize: 12, color: 'rgba(248,113,113,0.9)' }}>{error}</span>}
    </div>
  );
}
