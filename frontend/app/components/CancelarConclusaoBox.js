'use client';
import { Undo2 } from 'lucide-react';
import { Button } from '@/app/components/ui';
import { useUndoTicketDone } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T } from '@/app/lib/theme';

/**
 * Desfaz a conclusão informada — o chamado volta a andar.
 *
 * A conclusão tranca a linha do tempo, e tranca para todo mundo: o que o
 * responsável entregou é o que o moderador vai validar, e uma linha que
 * continua crescendo depois da entrega não é mais a entrega. Esta é a porta de
 * volta de quem concluiu cedo demais — a peça que ainda ia chegar, o teste que
 * faltou.
 *
 * A forma é a do "Cancelar envio" (ver `CancelarEnvioBox`, em `ChamadoModal`),
 * e de propósito: são o mesmo gesto em dois pontos da vida do chamado —
 * desfazer o passo anterior sem apagar nada. Quem já desfez um reconhece o
 * outro antes de ler.
 *
 * Mora em arquivo próprio porque duas telas o abrem: a página do chamado, do
 * responsável, e a caixa de processamento, do moderador. O irmão dele continua
 * dentro do `ChamadoModal`, onde é usado uma vez só.
 */
export function CancelarConclusaoBox({ ticket, onDone }) {
  const undo = useUndoTicketDone();
  const { show: toast } = useToastStore();

  async function handleCancel() {
    try {
      await undo.mutateAsync(ticket.id);
      toast('Conclusão cancelada — o chamado voltou a andar', 'success');
      onDone?.();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao cancelar a conclusão', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
        Cancelar devolve o chamado ao andamento e libera a linha do tempo para
        novos registros. O relatório do serviço fica guardado. Só vale enquanto
        o moderador não fechou.
      </p>
      <Button variant="secondary" onClick={handleCancel} loading={undo.isPending} style={{ width: '100%' }}>
        <Undo2 size={14} /> Cancelar conclusão
      </Button>
    </div>
  );
}
