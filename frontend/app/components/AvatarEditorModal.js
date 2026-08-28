'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button, Modal } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { useUpdateAvatar, useRemoveAvatar } from '@/app/hooks/useApi';
import { T, R, W } from '@/app/lib/theme';

/** Lado da área de recorte na tela e do arquivo gravado. */
const FRAME = 248;
const OUTPUT = 512;
const MAX_ZOOM = 3;
/** Acima disso o navegador engasga para decodificar antes mesmo do recorte. */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/**
 * Ajuste da foto de perfil: arrastar para enquadrar, barra para aproximar.
 *
 * O recorte acontece aqui, não no servidor. Uma foto de celular chega com 4 MB
 * e 4000px de lado; subir isso para depois cortar gastaria a banda de quem está
 * em campo, que é justamente onde o app roda. O que sai daqui é um quadrado de
 * 512px em JPEG — algumas dezenas de KB.
 */
export function AvatarEditorModal({ open, onClose }) {
  // A foto escolhida e o enquadramento moram no corpo, um nível abaixo; o
  // escopo é o que os traz até aqui, que é onde a caixa fecha.
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  return (
    <>
      <Modal open={open} onClose={() => saida.guard(onClose)} title="Foto de perfil" maxWidth={340}>
        {/* O corpo mora aqui dentro de propósito: quando a caixa fecha de vez, o
            Modal desmonta os filhos e o recorte volta do zero sozinho — sem
            efeito nenhum para limpar estado. */}
        <UnsavedScope report={report}>
          <AvatarEditor onClose={onClose} />
        </UnsavedScope>
      </Modal>

      <UnsavedChangesModal
        open={saida.asking}
        message="Você escolheu uma foto e ainda não salvou. Sair agora descarta o recorte."
        onConfirm={saida.confirm}
        onCancel={saida.cancel}
      />
    </>
  );
}

function AvatarEditor({ onClose }) {
  const { user, setUser } = useAuthStore();
  const { show: toast } = useToastStore();
  const updateAvatar = useUpdateAvatar();
  const removeAvatar = useRemoveAvatar();

  const fileInputRef = useRef(null);
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);

  const [source, setSource] = useState(null); // { url, width, height }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Escolher a foto é meio caminho: o que vale é o recorte, e ele só existe
  // aqui até alguém salvar.
  useUnsavedField(!!source);

  // A URL do arquivo escolhido é do navegador, não da rede: sem revogar, cada
  // troca de foto deixa o blob anterior preso na memória da aba.
  useEffect(() => () => { if (source?.url) URL.revokeObjectURL(source.url); }, [source]);

  // Escala que faz o menor lado cobrir o quadro — o piso do zoom
  const baseScale = source ? FRAME / Math.min(source.width, source.height) : 1;
  const displayWidth = source ? source.width * baseScale * zoom : 0;
  const displayHeight = source ? source.height * baseScale * zoom : 0;

  /** A foto nunca pode deixar canto vazio dentro do quadro. */
  function clamp(next, width = displayWidth, height = displayHeight) {
    return {
      x: Math.min(0, Math.max(FRAME - width, next.x)),
      y: Math.min(0, Math.max(FRAME - height, next.y)),
    };
  }

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('Escolha um arquivo de imagem', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast('Imagem muito pesada. O limite é 12 MB.', 'error');
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = FRAME / Math.min(image.naturalWidth, image.naturalHeight);
      setSource({ url, width: image.naturalWidth, height: image.naturalHeight });
      setZoom(1);
      setOffset({
        x: (FRAME - image.naturalWidth * scale) / 2,
        y: (FRAME - image.naturalHeight * scale) / 2,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast('Não foi possível abrir essa imagem', 'error');
    };
    image.src = url;
  }

  function handlePointerDown(event) {
    if (!source) return;
    frameRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setOffset((prev) => clamp({ x: prev.x + dx, y: prev.y + dy }));
  }

  function handlePointerUp(event) {
    dragRef.current = null;
    frameRef.current?.releasePointerCapture?.(event.pointerId);
  }

  /** Aproximar mantém o centro do quadro no lugar, não o canto da foto. */
  function handleZoom(next) {
    const width = source.width * baseScale * next;
    const height = source.height * baseScale * next;
    const ratio = next / zoom;

    setOffset((prev) => clamp(
      {
        x: FRAME / 2 - (FRAME / 2 - prev.x) * ratio,
        y: FRAME / 2 - (FRAME / 2 - prev.y) * ratio,
      },
      width,
      height
    ));
    setZoom(next);
  }

  async function handleSave() {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext('2d');

    // Do quadro na tela para o pixel da foto original
    const pixelsPerFrameUnit = 1 / (baseScale * zoom);
    const sourceX = -offset.x * pixelsPerFrameUnit;
    const sourceY = -offset.y * pixelsPerFrameUnit;
    const sourceSize = FRAME * pixelsPerFrameUnit;

    context.drawImage(imageRef.current, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    try {
      const updated = await updateAvatar.mutateAsync(dataUrl);
      setUser(updated);
      toast('Foto atualizada!', 'success');
      onClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar a foto', 'error', e);
    }
  }

  async function handleRemove() {
    try {
      const updated = await removeAvatar.mutateAsync();
      setUser(updated);
      toast('Foto removida', 'info');
      onClose();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao remover a foto', 'error', e);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        {source ? (
          <>
            <div
              ref={frameRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: 'relative', width: FRAME, height: FRAME, alignSelf: 'center',
                borderRadius: '50%', overflow: 'hidden', background: T.chip,
                cursor: 'grab', touchAction: 'none', userSelect: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={source.url}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: offset.x, top: offset.y,
                  width: displayWidth, height: displayHeight,
                  maxWidth: 'none', pointerEvents: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: T.faint, fontSize: 12 }}>Zoom</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                aria-label="Aproximar a foto"
                onChange={(e) => handleZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: T.accent }}
              />
            </div>

            <p style={{ color: T.faint, fontSize: 12, textAlign: 'center' }}>
              Arraste a foto para enquadrar
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                Trocar
              </Button>
              <Button style={{ flex: 1 }} onClick={handleSave} loading={updateAvatar.isPending}>
                Salvar
              </Button>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="transition-colors duration-150"
              style={{
                width: FRAME, height: FRAME, alignSelf: 'center', borderRadius: '50%',
                background: 'transparent', border: `1px dashed ${T.line}`, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = 'transparent'; }}
            >
              <ImagePlus size={26} color={T.accentInk} />
              <span style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 14, color: T.text }}>
                Escolher foto
              </span>
              <span style={{ color: T.faint, fontSize: 12 }}>JPG, PNG ou WEBP</span>
            </button>

            {user?.avatar_url && (
              <Button
                variant="ghost"
                onClick={handleRemove}
                loading={removeAvatar.isPending}
                style={{ color: T.danger, alignSelf: 'center' }}
              >
                <Trash2 size={15} /> Remover foto atual
              </Button>
            )}
          </>
        )}
    </div>
  );
}
