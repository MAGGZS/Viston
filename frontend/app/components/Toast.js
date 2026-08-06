'use client';
import { useToastStore } from '@/app/store/toast';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const STYLES = {
  success: { border: 'rgba(34,197,94,0.3)', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle, color: '#4ade80' },
  error:   { border: 'rgba(239,68,68,0.3)',  bg: 'rgba(239,68,68,0.1)',  icon: AlertCircle, color: '#f87171' },
  info:    { border: 'rgba(245,197,24,0.3)', bg: 'rgba(245,197,24,0.08)', icon: Info,        color: '#F5C518' },
};

export function Toast() {
  const { toasts, dismiss } = useToastStore();
  if (!toasts.length) return null;

  return (
    <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        const Icon = s.icon;
        return (
          <div key={t.id}
            style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(13,13,13,0.95)', backdropFilter: 'blur(20px)', border: `1px solid ${s.border}`, borderRadius: 14, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 260, maxWidth: 420, animation: 'toast-in 0.25s ease' }}>
            <Icon size={18} color={s.color} style={{ flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, flex: 1 }}>{t.message}</span>
            <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 2, display: 'flex' }}>
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
