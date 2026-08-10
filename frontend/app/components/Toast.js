'use client';
import { useState } from 'react';
import { useToastStore } from '@/app/store/toast';
import { X, CheckCircle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { T, R, W } from '@/app/lib/theme';

// O ícone colorido já diz o tipo; a superfície é a mesma nos três casos.
const STYLES = {
  success: { icon: CheckCircle, color: T.accent },
  error:   { icon: AlertCircle, color: T.danger },
  info:    { icon: Info,        color: T.mute },
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div style={{ background: T.card, borderRadius: R.card, padding: 22, maxWidth: 560, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={17} color={T.danger} />
            <span style={{ color: T.danger, fontWeight: W.title, fontSize: 14 }}>Log do erro</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <pre style={{ flex: 1, overflowY: 'auto', background: T.chip, borderRadius: R.control, padding: '13px 15px', color: T.text, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: T.display, fontWeight: W.body }}>
          {lines.join('\n\n')}
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(lines.join('\n\n'))}
          style={{ alignSelf: 'flex-end', background: T.chip, border: 'none', borderRadius: R.control, padding: '9px 16px', color: T.text, fontFamily: T.display, fontWeight: W.strong, fontSize: 12, cursor: 'pointer' }}>
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
              style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 10, background: T.card, borderRadius: R.control, padding: '12px 16px', minWidth: 260, maxWidth: 420, animation: 'toast-in 0.25s ease', cursor: hasDetail ? 'pointer' : 'default' }}
              onClick={() => hasDetail && setOpenLog(t)}>
              <Icon size={17} color={s.color} style={{ flexShrink: 0 }} />
              <span style={{ color: T.text, fontSize: 14, flex: 1 }}>{t.message}</span>
              {hasDetail && (
                <span style={{ color: T.faint, fontSize: 11, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                  ver log <ChevronRight size={12} />
                </span>
              )}
              <button onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 2, display: 'flex' }}>
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
