'use client';
import { AlertTriangle } from 'lucide-react';
import { Button, Modal } from '@/app/components/ui';
import { T } from '@/app/lib/theme';

/**
 * Confirmação curta: um aviso, uma pergunta e as duas saídas.
 *
 * Morava dentro dos modais de prédio, que foram os primeiros a precisar dela.
 * Saiu de lá quando a mesma pergunta passou a valer para toda a saída de
 * formulário mexido — ver `UnsavedChangesModal`, logo abaixo.
 */
export function ConfirmModal({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Voltar', confirmVariant = 'danger', onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangle size={18} color={T.danger} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={confirmVariant} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

export const UNSAVED_TITLE = 'Descartar alterações?';
export const UNSAVED_MESSAGE = 'Você mexeu neste formulário e ainda não salvou. Sair agora perde o que foi preenchido.';

/**
 * A pergunta única da saída de um formulário mexido.
 *
 * O texto é o mesmo em todo o sistema de propósito: quem já leu uma vez
 * reconhece a caixa antes de ler de novo, e a resposta errada custa o
 * preenchimento inteiro. Onde a perda tem nome — a vistoria de um andar, o
 * prédio que não chegou a ser criado — a tela manda a sua própria `message`.
 *
 * "Continuar editando" é a saída segura, e por isso é a que fica à esquerda,
 * onde o polegar já espera o botão de voltar.
 */
export function UnsavedChangesModal({ open, message = UNSAVED_MESSAGE, confirmLabel = 'Descartar', onConfirm, onCancel }) {
  return (
    <ConfirmModal
      open={open}
      title={UNSAVED_TITLE}
      message={message}
      cancelLabel="Continuar editando"
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
