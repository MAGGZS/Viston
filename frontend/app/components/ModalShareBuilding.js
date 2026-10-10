'use client';
import { useEffect, useId, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, Check, Clock, Copy, KeyRound, Link2, RotateCw, X } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { useBuildingShareToken, useRotateBuildingShareToken, useRotateShareKey } from '@/app/hooks/useApi';
import { mensagemDoErro } from '@/app/lib/erros';
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
 *
 * São duas formas de convidar, e cada uma tem uma frase dizendo para quem é:
 *
 *   QR Code e link  para quem está com você agora. Valem 15 minutos, e por isso
 *                   podem ser mostrados sem cerimônia.
 *   Código          a `share_key` do prédio, para mandar por mensagem. Vale até
 *                   o gestor gerar outro, e é por isso que "gerar novo" pede
 *                   confirmação e explica o que acontece.
 *
 * `shareKey` é a chave atual do prédio, que só a conta de gestor recebe (ver o
 * painel do prédio no backend). Sem ela, a seção do código não aparece.
 */
export function ModalShareBuilding({
  open,
  onClose,
  anchorRef,
  anchorEl,
  centered = false,
  buildingId,
  buildingName,
  shareKey,
}) {
  const isCentered = centered || (!anchorRef && !anchorEl);

  const { show: toast } = useToastStore();
  const { data: tokenData, isLoading, refetch } = useBuildingShareToken(buildingId, open);
  const rotateMutation = useRotateBuildingShareToken();
  const rotateKey = useRotateShareKey();

  // A chave gerada agora vale mais que a da prop: a prop vem de uma consulta
  // que só se refaz depois, e mostrar a antiga por um instante faria o gestor
  // copiar justamente o código que acabou de invalidar.
  const [novaChave, setNovaChave] = useState(null);
  const [confirmandoNovoCodigo, setConfirmandoNovoCodigo] = useState(false);
  const [erroNovoCodigo, setErroNovoCodigo] = useState(null);
  const [chaveCopiada, setChaveCopiada] = useState(false);
  const chaveCopiadaTimeoutRef = useRef(null);
  const chaveAtual = novaChave && novaChave.buildingId === buildingId ? novaChave.key : shareKey;
  const chaveFormatada = chaveAtual ? formatShareKey(chaveAtual) : '';

  // Fechar ou trocar de prédio zera a confirmação: ela é de um prédio só, e a
  // lista do gestor reaproveita este painel para o próximo prédio que abrir.
  // O ajuste é feito no render, comparando com o painel anterior, e não num
  // efeito: assim a confirmação velha nunca chega a ser pintada.
  const painel = open ? buildingId : null;
  const [painelAnterior, setPainelAnterior] = useState(painel);
  if (painelAnterior !== painel) {
    setPainelAnterior(painel);
    setConfirmandoNovoCodigo(false);
    setErroNovoCodigo(null);
    setChaveCopiada(false);
  }

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

  // Tecla Escape para fechar. Com a confirmação do código novo aberta, o
  // Escape desfaz só a confirmação: quem apertou queria desistir de trocar o
  // código, e não perder o painel inteiro. Enquanto o pedido está no ar, o
  // Escape espera, como o próprio botão Cancelar.
  const gerandoChave = rotateKey.isPending;
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (confirmandoNovoCodigo) {
        if (!gerandoChave) {
          setErroNovoCodigo(null);
          setConfirmandoNovoCodigo(false);
        }
        return;
      }
      onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, confirmandoNovoCodigo, gerandoChave]);

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
      if (chaveCopiadaTimeoutRef.current) clearTimeout(chaveCopiadaTimeoutRef.current);
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

  // A cópia só se anuncia depois que a área de transferência aceitou. Sem
  // permissão (ou fora de HTTPS) o `writeText` recusa, e dizer "copiado" ali
  // faria o gestor colar na mensagem o que estava antes na área de transferência.
  async function handleCopyKey() {
    if (!chaveFormatada) return;
    try {
      await navigator.clipboard.writeText(chaveFormatada);
    } catch {
      toast('Não foi possível copiar. Selecione o código e copie.', 'error');
      return;
    }
    setChaveCopiada(true);
    toast('Código do prédio copiado', 'info');
    if (chaveCopiadaTimeoutRef.current) clearTimeout(chaveCopiadaTimeoutRef.current);
    chaveCopiadaTimeoutRef.current = setTimeout(() => setChaveCopiada(false), 4000);
  }

  function handleGenerateKey() {
    setErroNovoCodigo(null);
    rotateKey.mutate(buildingId, {
      onSuccess: (data) => {
        setNovaChave({ buildingId, key: data?.share_key });
        setConfirmandoNovoCodigo(false);
        setChaveCopiada(false);
        toast('Novo código gerado. O anterior já não funciona.', 'success');
      },
      onError: (err) => {
        setErroNovoCodigo(mensagemDoErro(err, 'Não foi possível gerar outro código. Tente de novo em instantes.'));
      },
    });
  }

  function handleRotateManual() {
    rotateMutation.mutate(buildingId, {
      onSuccess: () => {
        toast('Novo QR Code e link gerados', 'success');
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
        /*
          A confirmação do código novo entra por transição, e não por keyframe:
          abrir e cancelar em sequência retoma do ponto em que estava, em vez
          de recomeçar do zero.
        */
        .confirmacao-codigo {
          transition: opacity 200ms var(--ease-saida, ease-out), transform 200ms var(--ease-saida, ease-out);
        }
        @starting-style {
          .confirmacao-codigo { opacity: 0; transform: translateY(6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @starting-style {
            .confirmacao-codigo { transform: none; }
          }
        }
        /*
          "Copiar" e "Gerar novo código" são texto de 12px: no dedo, o alvo
          cresce até 44px por dentro (padding) e a margem negativa devolve o
          espaço, para o desenho não mudar de lugar.
        */
        @media (pointer: coarse) {
          .alvo-toque {
            min-height: 44px;
            padding: 0 8px;
            margin: -13px -8px;
          }
        }
      `}</style>

      {/* Backdrop: escurecido no modo centralizado, transparente no modo ancorado */}
      {/*
        `aria-hidden` porque o fundo não é conteúdo: não há o que um leitor de
        tela anuncie nele, e o painel em si já se apresenta logo abaixo.

        É também o que responde ao lint de acessibilidade, e a resposta é
        honesta: o clique no fundo é atalho de mouse, e o equivalente de teclado
        já existe — o Escape fecha o painel (ver o efeito lá em cima). Dar
        `tabIndex` e `onKeyDown` a esta camada criaria uma parada de tabulação
        invisível cobrindo a tela inteira, pior para quem navega pelo teclado do
        que a regra que ela calaria.
      */}
      <div
        aria-hidden="true"
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
              Convide alguém para{' '}
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

        {/* QR Code e link: a frase que diz para quem é esta forma de convite. */}
        <div>
          <h3 style={{ fontFamily: T.display, fontSize: 14, fontWeight: W.title, color: T.text, margin: 0 }}>
            QR Code e link
          </h3>
          <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.5, margin: '3px 0 0' }}>
            Para quem está com você agora. Valem 15 minutos.
          </p>
        </div>

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
                // O nome da imagem para o leitor de tela: sem ele o QR era um
                // gráfico mudo no meio do painel.
                title="QR Code do convite, vale 15 minutos"
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

        {chaveAtual && (
          <>
            <div style={{ height: 1, background: T.line, width: '100%' }} />
            <CodigoDoPredio
              chave={chaveFormatada}
              copiada={chaveCopiada}
              onCopy={handleCopyKey}
              confirmando={confirmandoNovoCodigo}
              onPedirNovo={() => { setErroNovoCodigo(null); setConfirmandoNovoCodigo(true); }}
              onCancelar={() => { setErroNovoCodigo(null); setConfirmandoNovoCodigo(false); }}
              onConfirmar={handleGenerateKey}
              gerando={rotateKey.isPending}
              erro={erroNovoCodigo}
            />
          </>
        )}
      </div>
    </>,
    document.body
  );
}


/**
 * O aviso do código do prédio, escrito a partir do que o servidor faz de fato.
 *
 * `POST /buildings/:id/share-key/rotate` só troca a `share_key` do prédio. Não
 * mexe em vínculo nenhum nem na fila de pedidos: quem já entrou continua, e o
 * pedido que já chegou (inclusive um feito com o código vazado) continua
 * esperando a resposta do gestor. Também não toca no QR Code e no link de 15
 * minutos, que são outra credencial. A frase diz isso, para que ninguém gere
 * um código novo achando que tirou alguém do prédio ou limpou a fila.
 */
export const AVISO_CODIGO_DO_PREDIO =
  'Se este código foi parar onde não devia, gere um novo. O código antigo para de funcionar na hora.';
export const EFEITO_NOVO_CODIGO =
  'Quem já está no prédio continua nele, e os pedidos que já chegaram continuam esperando sua resposta. O QR Code e o link não mudam.';

/**
 * A seção do código permanente do prédio.
 *
 * A confirmação mora aqui dentro, no lugar do botão, e não numa segunda caixa:
 * o painel já é um diálogo, e uma caixa sobre ele tiraria o foco de perto do
 * código que ela está prestes a trocar.
 */
function CodigoDoPredio({ chave, copiada, onCopy, confirmando, onPedirNovo, onCancelar, onConfirmar, gerando, erro }) {
  const tituloId = useId();
  const avisoId = useId();
  const erroId = useId();

  // O foco acompanha a confirmação, porque ela troca de lugar com o botão que
  // a abriu. Abrindo, vai para "Cancelar", a saída sem estrago. Fechando, volta
  // para "Gerar novo código" se a pessoa desistiu, ou para "Copiar" se o código
  // novo saiu, que é o próximo passo dela. Sem isso o foco caía no começo da
  // página com o botão desmontado.
  const copiarRef = useRef(null);
  const pedirNovoRef = useRef(null);
  const cancelarRef = useRef(null);
  const chaveAoConfirmar = useRef(null);
  useEffect(() => {
    if (confirmando) {
      chaveAoConfirmar.current = chave;
      cancelarRef.current?.focus();
      return;
    }
    if (chaveAoConfirmar.current === null) return;
    const trocou = chaveAoConfirmar.current !== chave;
    chaveAoConfirmar.current = null;
    (trocou ? copiarRef : pedirNovoRef).current?.focus();
    // `chave` fica fora de propósito: só a abertura e o fechamento movem o foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmando]);

  return (
    <section aria-labelledby={tituloId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 id={tituloId} style={{ fontFamily: T.display, fontSize: 14, fontWeight: W.title, color: T.text, margin: 0 }}>
          Código do prédio
        </h3>
        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.5, margin: '3px 0 0' }}>
          Para mandar por mensagem. Vale até você gerar outro.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: T.chip, borderRadius: R.control, padding: '10px 12px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <KeyRound size={14} color={T.mute} aria-hidden="true" />
          <span style={{ color: T.text, fontWeight: W.title, fontSize: 15, letterSpacing: '0.14em', fontFamily: 'monospace' }}>
            {chave}
          </span>
        </span>
        <button
          ref={copiarRef}
          type="button"
          onClick={onCopy}
          className="link-acao link-acao--acento alvo-toque"
          aria-label={copiada ? 'Código do prédio copiado' : `Copiar código do prédio ${chave}`}
          style={{ color: T.accentInk, fontSize: 12, fontWeight: W.strong, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
        >
          {copiada ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copiada ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <p id={avisoId} style={{ color: T.mute, fontSize: 12, lineHeight: 1.5, margin: 0 }}>
        {AVISO_CODIGO_DO_PREDIO}
      </p>

      {confirmando ? (
        <div
          role="group"
          aria-label="Confirmar novo código"
          className="confirmacao-codigo"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, background: T.chip, borderRadius: R.control, padding: 12 }}
        >
          <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: T.text, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            <AlertTriangle size={15} color={T.danger} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Gerar um novo código? O atual para de funcionar na hora. {EFEITO_NOVO_CODIGO}
            </span>
          </p>
          {erro && (
            <p id={erroId} role="alert" style={{ color: T.danger, fontSize: 12, lineHeight: 1.5, margin: 0 }}>
              {erro}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button ref={cancelarRef} variant="secondary" style={{ flex: 1, fontSize: 13, padding: '9px 12px' }} onClick={onCancelar} disabled={gerando}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              style={{ flex: 1, fontSize: 13, padding: '9px 12px' }}
              onClick={onConfirmar}
              loading={gerando}
              aria-describedby={erro ? erroId : undefined}
            >
              Gerar novo código
            </Button>
          </div>
        </div>
      ) : (
        <button
          ref={pedirNovoRef}
          type="button"
          onClick={onPedirNovo}
          className="link-acao alvo-toque"
          aria-describedby={avisoId}
          style={{ alignSelf: 'flex-start', color: T.mute, fontSize: 12, fontWeight: W.strong, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <RotateCw size={13} aria-hidden="true" />
          Gerar novo código
        </button>
      )}
    </section>
  );
}
