import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-bg-card rounded-2xl p-4 border border-white/5', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'ok' | 'warning' | 'error' | 'accent';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        {
          'bg-bg-elevated text-text-secondary': variant === 'default',
          'bg-status-ok/20 text-status-ok': variant === 'ok',
          'bg-status-warning/20 text-status-warning': variant === 'warning',
          'bg-status-error/20 text-status-error': variant === 'error',
          'bg-accent/20 text-accent': variant === 'accent',
        },
        className,
      )}
    >
      {children}
    </span>
  );
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center',
        sizes[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
