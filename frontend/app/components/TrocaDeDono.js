'use client';
import { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Clock } from 'lucide-react';
import { Button, Modal, Select } from '@/app/components/ui';
import { useBuildingTransfers, useRequestTransfer } from '@/app/hooks/useApi';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { avisarErro } from '@/app/lib/erros';
import { T } from '@/app/lib/theme';

const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Passar o prédio para outro gestor.
 *
 * Só o dono vê o formulário: é ele quem paga, e o servidor recusa o pedido de
 * qualquer outro (inclusive co-gestor). Os demais gestores veem quem é o dono e
 * se há uma troca em andamento, que é o que muda o dia a dia deles.
 *
 * O indicado precisa já ser gestor do prédio. Por isso a lista sai dos gestores
 * da seção de cima, e quem não está lá é adicionado primeiro pelo e-mail.
 *
 * A confirmação diz o preço antes do clique: sete dias para o outro aceitar, e
 * recusa ou silêncio inativam o prédio. É o tipo de consequência que não pode
 * aparecer só depois.
 */
export function TrocaDeDono({ buildingId, managers, ownerId }) {
  const me = useAuthStore((s) => s.user);
  const { show: toast } = useToastStore();
  const { data: transfers = [], isLoading } = useBuildingTransfers(buildingId);
  const requestTransfer = useRequestTransfer();

  const [destino, setDestino] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const souDono = me?.kind === 'MANAGER' && !!ownerId && me.id === ownerId;
  const dono = managers.find((m) => m.manager_id === ownerId)?.manager;
  const pendente = transfers.find((t) => t.status === 'PENDENTE');
  const candidatos = managers
    .filter((m) => m.manager_id !== ownerId)
    .map((m) => ({ value: m.manager_id, label: m.manager?.name ?? m.manager?.email ?? 'Gestor' }));
  const escolhido = candidatos.find((c) => c.value === destino);

  async function enviar() {
    try {
      await requestTransfer.mutateAsync({ buildingId, toManagerId: destino });
      toast(`Pedido enviado. ${escolhido?.label ?? 'O gestor'} tem 7 dias para aceitar.`, 'success');
      setConfirmando(false);
      setDestino('');
    } catch (err) {
      avisarErro(toast, err, 'Erro ao pedir a transferência');
    }
  }

  if (isLoading) return <div className="h-14 bg-chip rounded-control animate-pulse" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        {dono ? (
          <>Quem paga por este prédio hoje: <span className="font-semibold">{souDono ? 'você' : dono.name}</span></>
        ) : (
          'Este prédio ainda não tem um dono definido. Fale com o suporte.'
        )}
      </p>

      {pendente && (
        <div className="flex items-start gap-3 rounded-control px-4 py-3"
          style={{ background: T.accentSoft, border: `1px solid ${T.accentLine}` }}>
          <Clock size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <p className="text-sm text-ink leading-relaxed">
            Transferência para <span className="font-semibold">{pendente.to_manager?.name ?? 'outro gestor'}</span>{' '}
            aguardando resposta
            {new Date(pendente.expires_at) > new Date()
              ? ` até ${dataCurta(pendente.expires_at)}.`
              : '. O prazo venceu e o pedido será encerrado na rotina diária.'}
          </p>
        </div>
      )}

      {souDono && !pendente && (
        candidatos.length === 0 ? (
          <p className="text-mute text-sm">
            Para passar o prédio adiante, adicione primeiro quem vai recebê-lo como gestor, na seção acima.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Select
              wrapperClassName="flex-1"
              wrapperStyle={{ minWidth: 200 }}
              aria-label="Gestor que vai receber o prédio"
              placeholder="Escolha o novo dono"
              options={candidatos}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!destino}
              onClick={() => setConfirmando(true)}
              style={{ flexShrink: 0 }}
            >
              <ArrowRightLeft size={14} /> Passar o prédio
            </Button>
          </div>
        )
      )}

      <Modal open={confirmando} onClose={() => setConfirmando(false)} title="Passar o prédio">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color={T.danger} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ color: T.text, fontSize: 14, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p>
                <span style={{ fontWeight: 600 }}>{escolhido?.label}</span> recebe um convite e tem 7 dias
                para aceitar. Aceitando, o prédio e a cobrança dele passam para a conta dessa pessoa.
              </p>
              <p>
                Se ela recusar, ou não responder no prazo, o prédio é inativado e só o suporte reativa.
                O histórico não se perde.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button style={{ flex: 1 }} loading={requestTransfer.isPending} onClick={enviar}>
              Enviar convite
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
