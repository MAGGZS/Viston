'use client';
import { AlertTriangle, Info } from 'lucide-react';
import { Button, Modal } from '@/app/components/ui';
import { T } from '@/app/lib/theme';

/**
 * Confirmação curta: um aviso, uma pergunta e as duas saídas.
 *
 * Morava dentro dos modais de prédio, que foram os primeiros a precisar dela.
 * Saiu de lá quando a mesma pergunta passou a valer para toda a saída de
 * formulário mexido — ver `UnsavedChangesModal`, logo abaixo.
 *
 * `loading` é para a confirmação que vai ao servidor. Sem ela a caixa ficava
 * parada entre o toque e a resposta, sem dizer que algo estava acontecendo, e
 * quem apagava uma anotação da linha do tempo tocava em "Apagar" três vezes —
 * a segunda e a terceira caindo num registro que já tinha ido. Enquanto espera,
 * o botão vira giro e nenhuma das duas saídas responde, nem a tecla Esc, nem o
 * clique no fundo: sair no meio deixaria a pessoa sem saber se apagou.
 *
 * `tone` é o ícone ao lado da pergunta. O triângulo vermelho era o único, e
 * aparecia até em "Informar conclusão", que não apaga nada: o aviso de perigo
 * gritando onde não há perigo ensina a pessoa a não levar o triângulo a sério
 * quando ele importa. Sem `tone`, quem decide é o botão: confirmação
 * `danger` leva o triângulo, qualquer outra leva o "i" neutro, na tinta de
 * destaque. O ícone é enfeite (`aria-hidden`): a pergunta já está no título.
 *
 * `loadingLabel` (opcional) troca o giro mudo do botão por giro e texto
 * ("Publicando..."), para a confirmação que demora o bastante para a pessoa
 * se perguntar se o clique pegou. O botão guarda a largura (os dois dividem a
 * linha), fica `aria-busy`, e `loadingAnnouncement` vai para uma região
 * `aria-live`, porque o leitor de tela não anuncia a troca de texto de um
 * botão que já tem o foco. `error` (opcional) mostra a recusa do servidor
 * dentro da caixa, que continua aberta para tentar de novo. Sem as três, a
 * caixa é a de sempre.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  confirmVariant = 'danger',
  tone,
  loading = false,
  loadingLabel,
  loadingAnnouncement,
  error,
  onConfirm,
  onCancel,
}) {
  const perigo = (tone ?? (confirmVariant === 'danger' ? 'danger' : 'neutral')) === 'danger';
  const Icone = perigo ? AlertTriangle : Info;

  return (
    <Modal open={open} onClose={loading ? () => {} : onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icone
            size={18}
            color={perigo ? T.danger : T.accentInk}
            aria-hidden="true"
            data-tone={perigo ? 'danger' : 'neutral'}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        </div>
        {error && !loading && (
          <p role="alert" style={{ color: T.danger, fontSize: 13, lineHeight: 1.5, marginTop: -8 }}>{error}</p>
        )}
        {loadingLabel && (
          <span aria-live="polite" className="sr-only">{loading ? (loadingAnnouncement ?? loadingLabel) : ''}</span>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" style={{ flex: 1 }} disabled={loading} onClick={onCancel}>{cancelLabel}</Button>
          {loadingLabel ? (
            <Button
              variant={confirmVariant}
              style={{ flex: 1, ...(loading ? { opacity: 1, cursor: 'progress' } : null) }}
              disabled={loading}
              aria-busy={loading || undefined}
              onClick={onConfirm}
            >
              {loading ? (
                <>
                  <span className="giro" aria-hidden="true" />
                  {loadingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          ) : (
            <Button variant={confirmVariant} style={{ flex: 1 }} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
          )}
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
