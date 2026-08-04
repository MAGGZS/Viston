'use client';

export function Button({ children, variant = 'primary', className = '', loading = false, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[#F5C518] text-black hover:bg-[#E0B400] px-6 py-3',
    secondary: 'bg-[#1E1E1E] text-white border border-[#2A2A2A] hover:border-[#F5C518] px-6 py-3',
    ghost: 'text-[#9A9A9A] hover:text-white px-4 py-2',
    danger: 'bg-red-600 text-white hover:bg-red-700 px-6 py-3',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm text-[#9A9A9A]">{label}</label>}
      <input
        className={`bg-[#1E1E1E] border ${error ? 'border-red-500' : 'border-[#2A2A2A]'} rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#F5C518] transition-colors ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-[#1E1E1E] rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className={`${sizes[size]} border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin`} />
  );
}

export function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-[#2A2A2A] text-[#9A9A9A]',
    success: 'bg-green-900/40 text-green-400',
    warning: 'bg-yellow-900/40 text-yellow-400',
    danger: 'bg-red-900/40 text-red-400',
    accent: 'bg-[#F5C518]/20 text-[#F5C518]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-[#F5C518]' : 'bg-[#2A2A2A]'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
      </div>
      {label && <span className="text-white text-sm">{label}</span>}
    </label>
  );
}

export function StatusBadge({ synced }) {
  return synced ? (
    <Badge variant="success">✓ Sincronizado</Badge>
  ) : (
    <Badge variant="warning">⏳ Pendente</Badge>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`bg-[#2A2A2A] animate-pulse rounded-xl ${className}`} />;
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#1A1A1A] rounded-2xl p-6 w-full max-w-md border border-[#2A2A2A]">
        {title && <h2 className="text-lg font-bold text-white mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Select({ label, error, options = [], className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm text-[#9A9A9A]">{label}</label>}
      <select
        className={`bg-[#1E1E1E] border ${error ? 'border-red-500' : 'border-[#2A2A2A]'} rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F5C518] transition-colors ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
