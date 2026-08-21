'use client';
import { useId, useState } from 'react';
import { Dialog } from '@/app/components/ui';
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
  // Antes do `return null`: hook não pode ficar atrás de saída condicional.
  const titleId = useId();

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
    // Mesma caixa de diálogo do resto do produto: Escape fecha, o Tab fica
    // dentro, e o foco volta para o toast que a abriu.
    <Dialog onClose={onClose} labelledBy={titleId} style={{ width: 560 }}>
      <div style={{ background: T.card, borderRadius: R.card, padding: 22, maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={17} color={T.danger} />
            <span id={titleId} style={{ color: T.danger, fontWeight: W.title, fontSize: 14 }}>Log do erro</span>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, display: 'flex' }}>
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
    </Dialog>
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
            // `role="status"` faz o leitor de tela anunciar o aviso quando ele
            // chega — antes ele aparecia e sumia sem nada dizer.
            //
            // "Ver log" virou botão em vez de clique no aviso inteiro: como
            // `<div onClick>` ele era alcançável só pelo mouse, e o aviso já
            // carrega o botão de fechar dentro — botão dentro de botão o
            // teclado não alcança.
            <div key={t.id}
              role="status"
              style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 10, background: T.card, borderRadius: R.control, padding: '12px 16px', minWidth: 260, maxWidth: 420, animation: 'toast-in 0.25s ease' }}>
              <Icon size={17} color={s.color} style={{ flexShrink: 0 }} />
              <span style={{ color: T.text, fontSize: 14, flex: 1 }}>{t.message}</span>
              {hasDetail && (
                <button
                  type="button"
                  onClick={() => setOpenLog(t)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.faint, fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2, font: 'inherit' }}
                >
                  ver log <ChevronRight size={12} />
                </button>
              )}
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dispensar aviso" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, padding: 2, display: 'flex' }}>
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
