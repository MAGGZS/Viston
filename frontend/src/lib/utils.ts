import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateLong(date: string | Date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function getHeatIntensity(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count === 0) return 0;
  if (count === 1) return 2;
  if (count === 2) return 3;
  if (count === 3) return 4;
  return 5;
}

export const STATUS_LABELS: Record<string, string> = {
  OK: 'OK',
  ATENCAO: 'Atenção',
  PROBLEMA: 'Problema',
  NOK: 'Não OK',
  NA: 'N/A',
};

export const STATUS_BG: Record<string, string> = {
  OK: 'bg-status-ok/20 text-status-ok',
  ATENCAO: 'bg-status-warning/20 text-status-warning',
  PROBLEMA: 'bg-status-error/20 text-status-error',
  NOK: 'bg-status-error/20 text-status-error',
  NA: 'bg-text-muted/20 text-text-secondary',
};
