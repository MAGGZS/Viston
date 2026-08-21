'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, Check, Inbox } from 'lucide-react';
import { M, MRound } from '@/app/components/mobile/kit';
import { Badge, Modal } from '@/app/components/ui';
import { useMyTickets, useReceiveTicket } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES, PRIORITIES, labelOf } from '@/app/lib/maintenanceOptions';
import { isResponsible } from '@/app/lib/roles';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** Uma linha da caixa: o chamado que chegou, e o aceite ao lado. */
function ChamadoNovo({ ticket, onReceive, receiving }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${M.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 14, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
          </p>
          <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
            {labelOf(PRIORITIES, ticket.priority)}
          </Badge>
        </div>
        <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>
          {ticket.report?.building?.name} · {ticket.floor?.label}
        </p>
        {ticket.forwarded_at && (
          <p style={{ color: M.faint, fontSize: 12, marginTop: 2 }}>
            Encaminhado em {format(new Date(ticket.forwarded_at), 'dd/MM/yyyy', { locale: ptBR })}
          </p>
        )}
      </div>

      {/* O aceite é o próprio gesto da caixa: quem abriu já sabe o que chegou, e
          o que falta é dizer que pegou. */}
      <MRound label={`Receber o chamado de ${labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}`} onClick={() => onReceive(ticket)} active>
        {receiving ? <Inbox size={17} /> : <Check size={19} />}
      </MRound>
    </div>
  );
}

/**
 * O sino da tela inicial do responsável.
 *
 * O chamado encaminhado não avisava ninguém: quem atende só descobria abrindo a
 * aba de manutenções. Aqui ele chega onde a pessoa já está, com o número do que
 * espera aceite — e o aceite acontece na própria caixa, num toque.
 *
 * Receber leva direto às manutenções, porque é lá que o trabalho continua: o
 * chamado aceito sai desta caixa e vira um card com o relatório e o botão de
 * concluir.
 *
 * Só aparece para quem atende chamado em algum prédio; para o resto seria um
 * sino que nunca toca.
 */
export function NotificacaoChamados() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const atende = isResponsible(user);
  const { data } = useMyTickets(atende);
  const receive = useReceiveTicket();
  const { show: toast } = useToastStore();

  if (!atende) return null;

  const pendentes = (data?.tickets ?? []).filter((t) => t.status === 'ENCAMINHADO');

  async function handleReceive(ticket) {
    try {
      await receive.mutateAsync(ticket.id);
      setOpen(false);
      toast('Chamado recebido. Ele está com você agora.', 'success');
      router.push('/responsavel');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  return (
    <>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <MRound label="Chamados encaminhados a você" onClick={() => setOpen(true)}>
          <Bell size={18} />
        </MRound>
        {pendentes.length > 0 && (
          <span
            className="anim-pop-in"
            style={{
              position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
              padding: '0 5px', borderRadius: 999, background: M.accent, color: '#000',
              fontFamily: M.display, fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // A borda é do fundo da página: sem ela o número encosta no botão
              // e os dois viram uma mancha só.
              border: `2px solid ${M.bg}`,
            }}
          >
            {pendentes.length}
          </span>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Chamados encaminhados a você" maxWidth={420}>
        {pendentes.length === 0 ? (
          <p style={{ color: M.mute, fontSize: 14, lineHeight: 1.6, padding: '8px 0 4px' }}>
            Nada esperando aceite. Quando o moderador encaminhar uma ocorrência
            para você, ela aparece aqui.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pendentes.map((ticket) => (
              <ChamadoNovo
                key={ticket.id}
                ticket={ticket}
                onReceive={handleReceive}
                receiving={receive.isPending}
              />
            ))}
            <p style={{ color: M.faint, fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
              Receber leva você às manutenções, onde o chamado ganha o relatório
              do serviço e o botão de concluir.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
