'use client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, ClipboardList, Hourglass, Inbox } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { Badge } from '@/app/components/ui';
import { M, MPage, MTopBar, MCard, MButton } from '@/app/components/mobile/kit';
import { useMyTickets, useReceiveTicket, useReportTicketDone } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/**
 * Um chamado encaminhado a esta pessoa.
 *
 * São dois gestos, um de cada vez. Primeiro "receber": o chamado chega
 * encaminhado e não anda até esta pessoa confirmar que sabe dele — antes,
 * encaminhar já o dava por começado, e ninguém tinha dito nada. Só depois
 * aparece "informar conclusão", que diz o que faz: o chamado passa a esperar o
 * moderador, que é quem fecha. Depois de informado, o cartão mostra que está
 * esperando — e não some da lista, senão quem informou por engano não teria
 * como perceber.
 */
function TicketCard({ ticket, className = '' }) {
  const receive = useReceiveTicket();
  const reportDone = useReportTicketDone();
  const { show: toast } = useToastStore();
  const pending = ticket.status === 'ENCAMINHADO';
  const waiting = ticket.status === 'AGUARDANDO_FECHAMENTO';

  async function handleReceive() {
    try {
      await receive.mutateAsync(ticket.id);
      toast('Chamado recebido. Ele está com você agora.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  async function handleDone() {
    try {
      await reportDone.mutateAsync(ticket.id);
      toast('Conclusão informada. O moderador vai fechar o chamado.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao informar conclusão', 'error');
    }
  }

  const day = parseReportDate(ticket.report?.date);

  return (
    <MCard
      className={className}
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        // O que espera aceite se destaca na pilha: é o único cartão em que a
        // pessoa ainda não fez nada.
        ...(pending ? { border: `1px solid ${M.accent}` } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 15, color: M.text }}>
            {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
          </p>
          <p style={{ color: M.mute, fontSize: 12, marginTop: 3 }}>
            {ticket.report?.building?.name} · {ticket.floor?.label}
          </p>
        </div>
        <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
          {labelOf(PRIORITIES, ticket.priority)}
        </Badge>
      </div>

      <p style={{ color: M.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {ticket.description}
      </p>

      {ticket.maintenance_note && (
        <div style={{ background: M.chip, borderRadius: 16, padding: '11px 13px' }}>
          <p style={{ color: M.mute, fontSize: 11, marginBottom: 4 }}>Do moderador</p>
          <p style={{ color: M.text, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {ticket.maintenance_note}
          </p>
          {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined && (
            <p style={{ color: M.mute, fontSize: 11, marginTop: 6 }}>
              Valor: {formatCost(ticket.maintenance_cost)}
            </p>
          )}
        </div>
      )}

      <p style={{ color: M.faint, fontSize: 11 }}>
        {labelOf(CATEGORIES, ticket.category)}
        {day ? ` · relatado em ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}` : ''}
      </p>

      {pending && (
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: 16, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <Hourglass size={15} color={M.accent} style={{ flexShrink: 0 }} />
          <p style={{ color: M.text, fontSize: 12, lineHeight: 1.5 }}>
            Encaminhado a você
            {ticket.forwarded_at
              ? ` em ${format(new Date(ticket.forwarded_at), 'dd/MM/yyyy', { locale: ptBR })}`
              : ''}
            . Receba para começar.
          </p>
        </div>
      )}

      {/* Um gesto de cada vez: informar conclusão só existe depois do
          recebimento — não se conclui o que não se recebeu. */}
      {pending ? (
        <MButton onClick={handleReceive} loading={receive.isPending} style={{ width: '100%' }}>
          <Inbox size={15} /> Receber chamado
        </MButton>
      ) : waiting ? (
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: 16, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <CheckCheck size={15} color={M.accent} style={{ flexShrink: 0 }} />
          <p style={{ color: M.text, fontSize: 12, lineHeight: 1.5 }}>
            Conclusão informada — aguardando o moderador fechar.
          </p>
        </div>
      ) : (
        <MButton onClick={handleDone} loading={reportDone.isPending} style={{ width: '100%' }}>
          Informar conclusão
        </MButton>
      )}
    </MCard>
  );
}

/**
 * A tela do responsável: o que foi encaminhado a ele, em todos os prédios.
 *
 * Ele não escolhe prédio nem navega por fila: abre e vê o que é dele. São dois
 * gestos, e só eles: receber o que foi encaminhado e, depois, dizer que
 * terminou — fechar é do moderador.
 */
export default function ResponsavelPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useMyTickets();
  const tickets = data?.tickets ?? [];
  const pendentes = tickets.filter((t) => t.status !== 'AGUARDANDO_FECHAMENTO').length;
  const aReceber = tickets.filter((t) => t.status === 'ENCAMINHADO').length;

  /**
   * O que a pessoa lê antes do título.
   *
   * O que espera aceite vem primeiro porque é o único que depende de um gesto
   * dela agora — o resto já está com ela.
   */
  const eyebrow =
    aReceber > 0
      ? `${aReceber} para receber`
      : pendentes > 0
        ? `${pendentes} para atender`
        : 'Nada pendente';

  return (
    <RouteGuard roles={['RESPONSAVEL']}>
      <MPage>
        <MTopBar
          className="anim-fade-down"
          eyebrow={eyebrow}
          title="Meus"
          accent="chamados"
        />

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="anim-fade-in animate-pulse" style={{ height: 150, background: M.card, borderRadius: 26 }} />
            ))}
          </div>
        )}

        {!isLoading && tickets.length === 0 && (
          <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <ClipboardList className="anim-pop-in anim-d2" size={34} color={M.faint} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>
              Nenhum chamado com você
            </p>
            <p style={{ color: M.mute, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              {user?.name?.split(' ')[0]}, quando o moderador encaminhar uma
              ocorrência para você, ela aparece aqui.
            </p>
          </MCard>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map((ticket, idx) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
            />
          ))}
        </div>

        <BottomNav />
      </MPage>
    </RouteGuard>
  );
}
