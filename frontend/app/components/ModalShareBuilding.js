'use client';
import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Clock, Link2, RotateCw, X } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { useBuildingShareToken, useRotateBuildingShareToken } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { formatShareKey, normalizeShareKey } from '@/app/lib/shareKey';
import { T, R, W } from '@/app/lib/theme';

const TOTAL_TTL_SECONDS = 15 * 60; // 15 minutos
const POPOVER_WIDTH = 380;

/**
 * Painel de compartilhamento temporário em formato Popover / Dropdown.
 * 
 * Em vez de abrir um modal centralizado no meio da tela, ele desce suavemente
 * e posiciona-se diretamente abaixo do botão de compartilhar, com fechamento
 * ao clicar fora ou pressionar Escape.
 * 
 * Estética 100% matte (fosca), sem brilhos ou auras artificiais.
 */
export function ModalShareBuilding({
  open,
  onClose,
  anchorRef,
  anchorEl,
  centered = false,
  buildingId,
  buildingName,
}) {
  const isCentered = centered || (!anchorRef && !anchorEl);

  const { show: toast } = useToastStore();
  const { data: tokenData, isLoading, refetch } = useBuildingShareToken(buildingId, open);
  const rotateMutation = useRotateBuildingShareToken();

  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const popoverRef = useRef(null);

  // Calcula a posição diretamente abaixo do botão quando não for centralizado
  const updatePosition = useCallback(() => {
    if (!open || isCentered) return;
    const el = anchorEl || anchorRef?.current;
    if (!el) {
      setCoords({
        top: 80,
        right: 32,
        width: POPOVER_WIDTH,
      });
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 16;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - padding * 2);

    // Posiciona logo abaixo do botão com 8px de respiro
    const top = rect.bottom + 8;

    // Se o botão está na metade direita da tela (ex: cabeçalho), alinha a borda direita do popover com a borda direita do botão
    const alignRight = rect.left + width > window.innerWidth - padding;
    if (alignRight) {
      const right = Math.max(padding, window.innerWidth - rect.right);
      setCoords({
        top,
        right,
        left: undefined,
        width,
        alignRight: true,
      });
    } else {
      const left = Math.max(padding, rect.left);
      setCoords({
        top,
        left,
        right: undefined,
        width,
        alignRight: false,
      });
    }
  }, [open, isCentered, anchorEl, anchorRef]);

  useLayoutEffect(() => {
    if (!open || isCentered) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, isCentered, updatePosition]);

  // Tecla Escape para fechar
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Garante refetch do token toda vez que for aberto
  useEffect(() => {
    if (open && buildingId) {
      refetch();
    }
  }, [open, buildingId, refetch]);

  // Limpa o timeout de feedback de cópia se desmontar
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  // Atualiza o relógio a cada segundo enquanto estiver aberto
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const targetExpiresAt = tokenData?.expires_at ? new Date(tokenData.expires_at).getTime() : 0;

  const secondsRemaining = useMemo(() => {
    if (!targetExpiresAt) return TOTAL_TTL_SECONDS;
    return Math.max(0, Math.floor((targetExpiresAt - now) / 1000));
  }, [targetExpiresAt, now]);

  const isExpired = targetExpiresAt > 0 && secondsRemaining <= 0;

  const rawToken = tokenData?.token ? normalizeShareKey(tokenData.token) : '';
  const formattedCode = rawToken ? formatShareKey(rawToken) : '--------';

  // Constrói a URL completa para o QR Code e link
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !rawToken) return '';
    return `${window.location.origin}/conectar?token=${rawToken}`;
  }, [rawToken]);

  // Formata tempo no estilo MM:SS
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  function handleCopyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast('Link de convite copiado!', 'info');
  }

  function handleCopyCode() {
    if (!formattedCode || formattedCode === '--------') return;
    navigator.clipboard.writeText(formattedCode);
    setCopied(true);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 4000);
  }

  function handleRotateManual() {
    rotateMutation.mutate(buildingId, {
      onSuccess: () => {
        toast('Novo código gerado com sucesso!', 'success');
      },
      onError: () => {
        toast('Erro ao renovar código', 'error');
      },
    });
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{`
        @keyframes modal-pop-center {
          from {
            opacity: 0;
            transform: translate(-50%, -46%) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes popover-drop {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes backdrop-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Backdrop: escurecido no modo centralizado, transparente no modo ancorado */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: isCentered ? 'var(--backdrop, rgba(0, 0, 0, 0.6))' : 'transparent',
          animation: isCentered ? 'backdrop-fade-in 0.2s ease both' : undefined,
        }}
      />

      {/* Cartão do Modal: centralizado na tela ou ancorado abaixo do botão */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compartilhar prédio"
        style={
          isCentered
            ? {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: POPOVER_WIDTH,
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
                zIndex: 9999,
                background: T.card,
                border: `1px solid ${T.line}`,
                borderRadius: 16,
                boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.5), 0 8px 24px -4px rgba(0, 0, 0, 0.2)',
                padding: 22,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                animation: 'modal-pop-center 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
              }
            : {
                position: 'fixed',
                top: coords ? coords.top : 80,
                left: coords?.left,
                right: coords?.right,
                width: coords?.width ?? POPOVER_WIDTH,
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: coords ? `calc(100vh - ${coords.top + 16}px)` : '85vh',
                overflowY: 'auto',
                zIndex: 9999,
                background: T.card,
                border: `1px solid ${T.line}`,
                borderRadius: 16,
                boxShadow: '0 16px 40px -6px rgba(0, 0, 0, 0.4), 0 4px 16px -2px rgba(0, 0, 0, 0.2)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                animation: 'popover-drop 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
                transformOrigin: coords?.alignRight ? 'top right' : 'top left',
              }
        }
      >
        {/* Cabeçalho do Popover com botão de fechar "X" */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: T.display, fontSize: 16, fontWeight: W.title, color: T.text, margin: 0 }}>
              Compartilhar prédio
            </h2>
            <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.4, margin: '3px 0 0' }}>
              Convite temporário para acesso a{' '}
              <strong style={{ color: T.text, fontWeight: W.strong }}>{buildingName}</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            style={{
              background: 'none',
              border: 'none',
              color: T.mute,
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: R.control,
              transition: 'color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.mute)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Barra sutil de separação */}
        <div style={{ height: 1, background: T.line, width: '100%' }} />

        {/* Bloco do QR Code (Sem fundo cinza, direto no card com respiro limpo) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 0',
          }}
        >
          {isLoading ? (
            <div style={{ width: 170, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint, fontSize: 13 }}>
              Gerando QR Code...
            </div>
          ) : rawToken ? (
            <div
              style={{
                background: '#FFFFFF',
                padding: 10,
                borderRadius: 10,
                border: '1px solid rgba(0, 0, 0, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QRCodeSVG
                value={shareUrl}
                size={170}
                level="H"
                marginSize={1}
                fgColor="#000000"
                bgColor="#FFFFFF"
                imageSettings={{
                  src: '/logo-qr-black.svg',
                  height: 50,
                  width: 58,
                  excavate: false,
                }}
              />
            </div>
          ) : (
            <div style={{ width: 170, height: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12, textAlign: 'center' }}>
              <span style={{ color: T.danger, fontSize: 13, lineHeight: 1.4 }}>Não foi possível carregar o código.</span>
              <button
                type="button"
                onClick={() => refetch()}
                style={{
                  background: T.card,
                  border: `1px solid ${T.line}`,
                  borderRadius: R.control,
                  color: T.text,
                  fontSize: 12,
                  fontWeight: W.strong,
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          <p style={{ color: T.faint, fontSize: 11, textAlign: 'center', letterSpacing: '0.02em', margin: '10px 0 0' }}>
            Aponte a câmera do celular para abrir o link
          </p>
        </div>

        {/* Barra sutil de separação */}
        <div style={{ height: 1, background: T.line, width: '100%' }} />

        {/* Cronômetro e botão de renovar ao lado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '0 2px' }}>
          <span style={{ color: T.mute, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color={isExpired ? T.danger : T.mute} />
            {isExpired ? 'Status:' : 'Expira em:'}{' '}
            <strong style={{ color: isExpired ? T.danger : T.text, fontWeight: W.strong, fontVariantNumeric: 'tabular-nums' }}>
              {isExpired ? 'Expirado' : timerText}
            </strong>
          </span>
          <button
            type="button"
            onClick={handleRotateManual}
            disabled={rotateMutation.isPending}
            style={{
              background: 'none',
              border: 'none',
              color: T.accentInk,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: W.strong,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: 0,
              opacity: rotateMutation.isPending ? 0.5 : 1,
            }}
          >
            <RotateCw size={13} className={rotateMutation.isPending ? 'spin' : ''} />
            Renovar agora
          </button>
        </div>

        {/* Código Alfanumérico Interativo ("código seco") */}
        <button
          type="button"
          onClick={handleCopyCode}
          title="Clique para copiar o código"
          aria-label={copied ? 'Código copiado' : `Copiar código ${formattedCode}`}
          className="hover:opacity-80 transition-opacity"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            outline: 'none',
            userSelect: 'none',
          }}
        >
          {copied ? (
            <span
              key="copied"
              className="anim-scale-in"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: T.success,
                fontSize: 15,
                fontWeight: W.strong,
                letterSpacing: '0.04em',
              }}
            >
              <Check size={17} strokeWidth={2.5} />
              Copiado
            </span>
          ) : (
            <span
              key="code"
              className="anim-scale-in"
              style={{
                color: T.text,
                fontWeight: W.title,
                fontSize: 17,
                letterSpacing: '0.18em',
                fontFamily: 'monospace',
                display: 'inline-block',
              }}
            >
              {formattedCode}
            </span>
          )}
        </button>

        {/* Botão de Copiar Link Direto */}
        <Button
          variant="secondary"
          onClick={handleCopyLink}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 13,
            padding: '10px',
          }}
        >
          <Link2 size={15} />
          Copiar link de convite
        </Button>
      </div>
    </>,
    document.body
  );
}

