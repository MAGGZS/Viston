import clsx from 'clsx';

export function Avatar({ name, url, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' };
  const initials = name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  if (url) {
    return <img src={url} alt={name} className={clsx('rounded-full object-cover', sizes[size])} />;
  }
  return (
    <div className={clsx('rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center', sizes[size])}>
      {initials}
    </div>
  );
}

export function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-white/10 text-text-secondary',
    accent: 'bg-accent/20 text-accent',
    ok: 'bg-status-ok/20 text-status-ok',
    atencao: 'bg-status-atencao/20 text-status-atencao',
    problema: 'bg-status-problema/20 text-status-problema',
  };
  return <span className={clsx('badge', variants[variant])}>{children}</span>;
}

export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className={clsx('border-2 border-accent border-t-transparent rounded-full animate-spin', sizes[size])} />
  );
}

export function StatusBadge({ status }) {
  const map = {
    OK: { label: 'OK', variant: 'ok' },
    ATENCAO: { label: 'Atenção', variant: 'atencao' },
    PROBLEMA: { label: 'Problema', variant: 'problema' },
    COMPLETED: { label: 'Concluído', variant: 'ok' },
    IN_PROGRESS: { label: 'Em andamento', variant: 'atencao' },
  };
  const { label, variant } = map[status] || { label: status, variant: 'default' };
  return <Badge variant={variant}>{label}</Badge>;
}

export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {Icon && <Icon className="w-12 h-12 text-text-secondary/40" />}
      <p className="font-semibold text-text-secondary">{title}</p>
      {description && <p className="text-sm text-text-secondary/60">{description}</p>}
    </div>
  );
}
