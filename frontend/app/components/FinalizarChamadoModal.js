'use client';
import { useEffect, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button, Modal } from '@/app/components/ui';
import { useCloseTicket } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * O formulário de finalização.
 *
 * Fechar deixou de ser um botão e virou um registro: o moderador escreve o que
 * foi a manutenção, e é esse texto que o relatório do período publica depois.
 * Sem ele, o chamado terminava com uma data e nada mais — e o relatório saía
 * com linhas em branco onde deveria estar o serviço.
 *
 * O gasto fica atrás de um check em vez de um campo sempre visível. Campo vazio
 * e "não houve gasto" são coisas diferentes, e um campo aberto empurra quem não
 * teve despesa a digitar zero — que no relatório vira R$ 0,00 somado, como se
 * alguém tivesse conferido.
 */
export function FinalizarChamadoModal({ ticket, open, onClose, onFinalizado }) {
  const close = useCloseTicket();
  const { show: toast } = useToastStore();

  const [note, setNote] = useState('');
  const [temGasto, setTemGasto] = useState(false);
  const [cost, setCost] = useState('');
  const [erro, setErro] = useState(null);

  /**
   * O cursor vai para o valor assim que o campo aparece.
   *
   * Foco por efeito, e não por `autoFocus`: o atributo rouba o cursor sempre
   * que o elemento monta, sem perguntar de onde a pessoa veio — é por isso que
   * a regra de acessibilidade o proíbe. Aqui o campo só existe porque alguém
   * acabou de marcar "houve gasto", e mandar o cursor para a resposta do que
   * ela mesma acabou de pedir é o oposto de roubá-lo.
   */
  const costRef = useRef(null);

  useEffect(() => {
    if (temGasto) costRef.current?.focus();
  }, [temGasto]);

  function reset() {
    setNote('');
    setTemGasto(false);
    setCost('');
    setErro(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Marcou que houve gasto e não disse quanto: fechar assim gravaria "sem
    // custo" num chamado que a própria pessoa acabou de dizer que teve.
    if (temGasto && cost.trim() === '') {
      setErro('Informe o valor do gasto ou desmarque a opção');
      return;
    }

    try {
      await close.mutateAsync({
        id: ticket.id,
        maintenance_note: note.trim() === '' ? null : note.trim(),
        maintenance_cost: temGasto ? Number(cost) : null,
      });
      toast('Chamado finalizado', 'success');
      onFinalizado?.();
      handleClose();
    } catch (e) {
      setErro(e?.response?.data?.error?.message || 'Erro ao finalizar o chamado');
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Finalizar chamado" maxWidth={440}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
          {ticket?.floor?.label} — {ticket?.description}
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: T.mute, fontSize: 12 }}>Relatório da manutenção</span>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="O que foi feito, o que ficou resolvido…"
            style={{
              background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
              borderRadius: R.control, padding: '12px 14px', color: T.text, fontSize: 14,
              outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
            }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={temGasto}
            onChange={(e) => { setTemGasto(e.target.checked); setErro(null); }}
            style={{ width: 16, height: 16, accentColor: T.accent, cursor: 'pointer' }}
          />
          <span style={{ color: T.text, fontSize: 14 }}>Houve gasto nesta manutenção</span>
        </label>

        {/* O campo só existe quando há o que preencher: mostrá-lo desabilitado
            deixaria a pergunta na tela depois de já respondida. */}
        {temGasto && (
          <label className="anim-scale-in" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ color: T.mute, fontSize: 12 }}>Valor (R$)</span>
            <input
              ref={costRef}
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => { setCost(e.target.value); setErro(null); }}
              placeholder="0,00"
              style={{
                background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
                borderRadius: R.control, padding: '11px 14px', color: T.text, fontSize: 14,
                outline: 'none', width: '100%',
              }}
            />
          </label>
        )}

        {erro && (
          <p role="alert" style={{ color: T.danger, fontSize: 12 }}>{erro}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={handleClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button type="submit" loading={close.isPending} style={{ flex: 1 }}>
            <CheckCheck size={15} /> Finalizar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Rótulo do botão, repetido nas duas telas que finalizam. */
export const FINALIZAR_LABEL = 'Finalizar';

export const finalizarButtonStyle = {
  fontSize: 13,
  fontWeight: W.strong,
};
