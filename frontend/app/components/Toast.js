'use client';
import { useState } from 'react';
import { useToastStore } from '@/app/store/toast';
import { X, CheckCircle, AlertCircle, Info, ChevronRight } from 'lucide-react';

const STYLES = {
  success: { border: 'rgba(34,197,94,0.3)',  bg: 'rgba(34,197,94,0.1)',   icon: CheckCircle, color: '#4ade80' },
  error:   { border: 'rgba(239,68,68,0.3)',   bg: 'rgba(239,68,68,0.1)',   icon: AlertCircle, color: '#f87171' },
  info:    { border: 'rgba(245,197,24,0.3)',  bg: 'rgba(245,197,24,0.08)', icon: Info,        color: '#F5C518' },
};

function formatDetail(detail) {
  if (!detail) return '';
  try { return JSON.stringify(detail, null, 2); }
  catch { return String(detail); }
}

function ErrorLogModal({ toast, onClose }) {
  if (!toast) return null;
  const detail = toast.detail;
  const lines = [];

  // Mensagem principal
  lines.push(`Mensagem: ${toast.message}`);

  // Status HTTP
  const status = detail?.response?.status || detail?.status;
  if (status) lines.push(`Status HTTP: ${status}`);

  // URL
  const url = detail?.config?.url || detail?.request?.responseURL;
  if (url) lines.push(`URL: ${url}`);

  // Método
  const method = detail?.config?.method?.toUpperCase();
  if (method) lines.push(`Método: ${method}`);

  // Body enviado
  const reqData = detail?.config?.data;
  if (reqData) {
    try { lines.push(`Body enviado:\n${JSON.stringify(JSON.parse(reqData), null, 2)}`); }
    catch { lines.push(`Body enviado: ${reqData}`); }
  }

  // Resposta do servidor
  const resData = detail?.response?.data;
  if (resData) lines.push(`Resposta do servidor:\n${formatDetail(resData)}`);

  // Stack trace
  const stack = detail?.stack;
  if (stack) lines.push(`Stack:\n${stack}`);

  // Fallback: objeto completo se não extraiu nada útil
  if (lines.length === 1 && detail) lines.push(`Detalhe:\n${formatDetail(detail)}`);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 24, maxWidth: 560, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={18} color="#f87171" />
            <span style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>Log do erro</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <pre style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {lines.join('\n\n')}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(lines.join('\n\n'))}
          style={{ alignSelf: 'flex-end', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
          Copiar log
        </button>
      </div>
    </div>
  );
}

export function Toast() {
  const { toasts, dismiss } = useToastStore();
  const [openLog, setOpenLog] = useState(null);

  return (
    <>
      <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          const Icon = s.icon;
          const hasDetail = t.type === 'error' && t.detail;
          return (
            <div key={t.id}
              style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(13,13,13,0.95)', backdropFilter: 'blur(20px)', border: `1px solid ${s.border}`, borderRadius: 14, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 260, maxWidth: 420, animation: 'toast-in 0.25s ease', cursor: hasDetail ? 'pointer' : 'default' }}
              onClick={() => hasDetail && setOpenLog(t)}>
              <Icon size={18} color={s.color} style={{ flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, flex: 1 }}>{t.message}</span>
              {hasDetail && (
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                  ver log <ChevronRight size={12} />
                </span>
              )}
              <button onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 2, display: 'flex' }}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <ErrorLogModal toast={openLog} onClose={() => setOpenLog(null)} />
    </>
  );
}
