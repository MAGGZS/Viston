'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, ClipboardList, FileText, Hourglass, Inbox } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { Badge } from '@/app/components/ui';
import { M, MPage, MTopBar, MCard, MButton, MButtonGhost } from '@/app/components/mobile/kit';
import { OcorrenciaModal } from '@/app/components/OcorrenciaModal';
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
 * O bloco de conclusão: o relatório do serviço e o botão que o envia.
 *
 * O texto é opcional — nem toda manutenção tem o que relatar, e obrigar o campo
 * só encheria o sistema de "ok". Mas ele fica aberto na tela, e não atrás de um
 * botão, porque é a única chance de contar o que foi feito: depois de concluir,
 * quem lê é o moderador, e ele não tem como perguntar de volta.
 */
function ConclusaoBox({ ticket }) {
  const reportDone = useReportTicketDone();
  const { show: toast } = useToastStore();
  const [report, setReport] = useState(ticket.done_report ?? '');

  async function handleDone() {
    try {
      await reportDone.mutateAsync({ id: ticket.id, done_report: report.trim() });
      toast('Conclusão informada. O moderador vai fechar o chamado.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao informar conclusão', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ color: M.mute, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={13} /> Relatório do serviço (se necessário)
        </span>
        <textarea
          rows={3}
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="O que foi feito, o que precisou trocar, o que ficou pendente…"
          style={{
            background: M.chip, border: '1px solid transparent', borderRadius: 16,
            padding: '13px 15px', color: M.text, fontSize: 14, outline: 'none',
            width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
          }}
        />
      </label>

      <MButton onClick={handleDone} loading={reportDone.isPending} style={{ width: '100%' }}>
        <CheckCheck size={15} /> Concluir serviço
      </MButton>
    </div>
  );
}

/**
 * Um chamado encaminhado a esta pessoa.
 *
 * São dois gestos, um de cada vez. Primeiro "receber": o chamado chega
 * encaminhado e não anda até esta pessoa confirmar que sabe dele — antes,
 * encaminhar já o dava por começado, e ninguém tinha dito nada. Só depois
 * aparece a conclusão, que diz o que faz: o chamado passa a esperar o
 * moderador, que é quem fecha. Depois de informada, o cartão mostra que está
 * esperando — e não some da lista, senão quem informou por engano não teria
 * como perceber.
 *
 * A descrição fica resumida aqui e inteira em "Detalhes": no telefone, o texto
 * completo de cada chamado empurra os outros para fora da tela.
 */
function TicketCard({ ticket, className = '' }) {
  const receive = useReceiveTicket();
  const { show: toast } = useToastStore();
  const [details, setDetails] = useState(false);
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

      <p style={{
        color: M.text, fontSize: 13, lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
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

      {waiting && (
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: 16, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <CheckCheck size={15} color={M.accent} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ color: M.text, fontSize: 12, lineHeight: 1.5 }}>
              Conclusão informada — aguardando o moderador fechar.
            </p>
            {ticket.done_report && (
              <p style={{ color: M.mute, fontSize: 12, lineHeight: 1.5, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {ticket.done_report}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Um gesto de cada vez: a conclusão só existe depois do recebimento —
          não se conclui o que não se recebeu. */}
      {!pending && !waiting && <ConclusaoBox ticket={ticket} />}

      <div style={{ display: 'flex', gap: 10 }}>
        <MButtonGhost onClick={() => setDetails(true)} style={{ flex: 1 }}>
          Detalhes
        </MButtonGhost>
        {pending && (
          <MButton onClick={handleReceive} loading={receive.isPending} style={{ flex: 1 }}>
            <Inbox size={15} /> Receber
          </MButton>
        )}
      </div>

      <OcorrenciaModal open={details} occurrence={ticket} onClose={() => setDetails(false)} />
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
