'use client';
import { useId, useState } from 'react';
import { CheckCheck, Hourglass, Inbox, Timer } from 'lucide-react';
import { Badge, Button, Modal, Skeleton, Textarea } from '@/app/components/ui';
import { ConfirmModal, UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import { LinhaDoTempo, temLinhaDoTempo } from '@/app/components/LinhaDoTempo';
import { CancelarConclusaoBox } from '@/app/components/CancelarConclusaoBox';
import { useTicket, useTicketUpdates, useReceiveTicket, useReportTicketDone } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { PRIORITY_VARIANT, dayLabel, stampLabel } from '@/app/lib/chamadoFormat';
import { EXECUTANDO, INFORMAR_CONCLUSAO, estadoParaOResponsavel, prazo, textoDoPrazo } from '@/app/lib/chamadosDoResponsavel';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';
import { mensagemDoErro } from '@/app/lib/erros';
import { T, R, W } from '@/app/lib/theme';

function Fact({ label, children, tone }) {
  return (
    <div>
      <p style={{ color: T.faint, fontSize: 11, marginBottom: 3 }}>{label}</p>
      <p style={{ color: tone ?? T.text, fontSize: 13 }}>{children}</p>
    </div>
  );
}

/**
 * Concluir o serviço — o mesmo bloco da tela do chamado no telefone.
 *
 * Exige ao menos um passo na linha do tempo, como lá: sem isso o chamado iria de
 * "recebido" a "concluído" sem uma linha dizendo o que aconteceu no meio. O
 * relatório é o resumo que o moderador lê para decidir fechar, e é opcional.
 */
function ConclusaoBox({ ticket, temRegistro, onDone }) {
  const reportDone = useReportTicketDone();
  const { show: toast } = useToastStore();
  const [report, setReport] = useState(ticket.done_report ?? '');
  // Mesma confirmação do telefone: diz, antes do envio, que o gesto não fecha
  // o chamado (ver `INFORMAR_CONCLUSAO`).
  const [confirmando, setConfirmando] = useState(false);
  const dicaId = useId();

  useUnsavedField(report !== (ticket.done_report ?? ''));

  async function handleDone() {
    try {
      await reportDone.mutateAsync({ id: ticket.id, done_report: report.trim() });
      setConfirmando(false);
      toast(INFORMAR_CONCLUSAO.sucesso, 'success');
      onDone?.();
    } catch (e) {
      setConfirmando(false);
      toast(mensagemDoErro(e, INFORMAR_CONCLUSAO.falha), 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Textarea
        label="Relatório do serviço (se necessário)"
        rows={3}
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="O resumo do serviço: o que resolveu, o que ficou pendente…"
      />
      <Button
        onClick={() => setConfirmando(true)}
        loading={reportDone.isPending}
        disabled={!temRegistro}
        aria-describedby={!temRegistro ? dicaId : undefined}
        style={{ width: '100%' }}
      >
        <CheckCheck size={15} /> {INFORMAR_CONCLUSAO.botao}
      </Button>
      {!temRegistro && (
        <p id={dicaId} style={{ color: T.faint, fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
          Registre ao menos uma atualização na linha do tempo antes de informar a conclusão.
        </p>
      )}

      <ConfirmModal
        open={confirmando}
        title={INFORMAR_CONCLUSAO.titulo}
        message={INFORMAR_CONCLUSAO.mensagem}
        confirmLabel={INFORMAR_CONCLUSAO.confirmar}
        cancelLabel={INFORMAR_CONCLUSAO.voltar}
        confirmVariant="primary"
        tone="neutral"
        loading={reportDone.isPending}
        onConfirm={handleDone}
        onCancel={() => setConfirmando(false)}
      />
    </div>
  );
}

/**
 * O chamado inteiro, numa caixa sobre o quadro.
 *
 * É a tela do chamado do telefone (ver `responsavel/chamados/[id]`) com o mesmo
 * conteúdo e os mesmos gestos — receber, registrar o andamento, concluir e
 * desfazer a conclusão. No computador vira caixa, e não tela, porque o quadro
 * inteiro continua sendo o contexto: fecha-se a caixa e está-se de volta na
 * coluna de onde o chamado saiu.
 *
 * `inicial` é o cartão que foi clicado: a caixa abre com ele na hora, e a versão
 * completa (`useTicket`) chega por cima — a mesma ideia do `placeholderData`.
 * Quando a caixa é aberta por endereço (`?abrir=`), não há cartão, e o que se vê
 * até a resposta chegar é esqueleto.
 */
export function ResponsavelChamadoModal({ ticketId, inicial, open, onClose }) {
  const { user } = useAuthStore();
  const { show: toast } = useToastStore();
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  const { data, isLoading, isError } = useTicket(open ? ticketId : null);
  const ticket = data ?? inicial ?? null;
  const { data: updatesData } = useTicketUpdates(ticketId, open && temLinhaDoTempo(ticket?.status));
  const receive = useReceiveTicket();

  async function handleReceive() {
    try {
      await receive.mutateAsync(ticketId);
      toast('Chamado recebido. Ele está com você agora.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  const pendente = ticket?.status === 'ENCAMINHADO';
  const executando = EXECUTANDO.includes(ticket?.status);
  const aguardandoFechamento = ticket?.status === 'AGUARDANDO_FECHAMENTO';
  const meu = !!user?.id && ticket?.responsible_id === user.id;
  const temRegistro = (updatesData?.updates?.length ?? 0) > 0;
  const p = prazo(ticket);

  return (
    <>
      <Modal open={open} onClose={() => saida.guard(onClose)} title={null} maxWidth={620}>
        {!ticket && isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[60, 120, 90].map((h) => <Skeleton key={h} style={{ height: h, borderRadius: R.control }} />)}
          </div>
        )}

        {!ticket && isError && (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <p style={{ color: T.text, fontWeight: W.title, fontSize: 16 }}>Chamado não encontrado</p>
            <p style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              Ele pode ter sido devolvido à fila, ou não estar mais com você.
            </p>
          </div>
        )}

        {ticket && (
          <UnsavedScope report={report}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* O estado dito para quem executou, como no telefone: ver
                      `ESTADO_PARA_O_RESPONSAVEL`. */}
                  <Badge variant={RECORD_STATUS_VARIANT[ticket.status] ?? 'default'}>
                    {estadoParaOResponsavel(ticket.status)}
                  </Badge>
                  <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
                    {labelOf(PRIORITIES, ticket.priority)}
                  </Badge>
                </div>
                <h2 style={{ color: T.text, fontSize: 18, fontWeight: W.title, marginTop: 10 }}>
                  {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
                </h2>
                <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
                  {ticket.report?.building?.name} · {ticket.floor?.label ?? 'Andar não informado'} · {labelOf(CATEGORIES, ticket.category)}
                </p>
              </div>

              <div>
                <p style={{ color: T.mute, fontSize: 12, marginBottom: 6 }}>O que está acontecendo</p>
                <p style={{ color: T.text, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {ticket.description}
                </p>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12,
                borderTop: `1px solid ${T.line}`, paddingTop: 14,
              }}>
                <Fact label="Relatado em">{dayLabel(ticket.report?.date)}</Fact>
                <Fact label="Vistoriado por">{ticket.report?.inspector?.name ?? '—'}</Fact>
                {ticket.forwarded_at && <Fact label="Encaminhado em">{stampLabel(ticket.forwarded_at)}</Fact>}
                {ticket.received_at && <Fact label="Recebido em">{stampLabel(ticket.received_at)}</Fact>}
                <Fact label="Prazo" tone={p.atrasado ? T.danger : undefined}>{textoDoPrazo(ticket)}</Fact>
                {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined && (
                  <Fact label="Gasto">{formatCost(ticket.maintenance_cost)}</Fact>
                )}
              </div>

              {ticket.maintenance_note && (
                <div style={{ background: T.chip, borderRadius: R.control, padding: '12px 14px' }}>
                  <p style={{ color: T.mute, fontSize: 12, marginBottom: 5 }}>Do moderador</p>
                  <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {ticket.maintenance_note}
                  </p>
                </div>
              )}

              {ticket.status === 'AGUARDANDO_TERCEIRO' && (
                <div style={{ background: T.chip, borderRadius: R.control, padding: '12px 14px', display: 'flex', gap: 10 }}>
                  <Timer size={16} color={T.mute} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ color: T.text, fontSize: 12, lineHeight: 1.6 }}>
                    O moderador marcou este chamado como aguardando terceiro — uma peça,
                    um fornecedor ou outra equipe. Continue registrando o andamento.
                  </p>
                </div>
              )}

              {pendente && meu && (
                <div className="anim-scale-in" style={{ background: T.accentSoft, borderRadius: R.control, padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Hourglass size={16} color={T.accentInk} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6 }}>
                      Encaminhado a você{ticket.forwarded_at ? ` em ${stampLabel(ticket.forwarded_at)}` : ''}.
                      Receba para começar a registrar o andamento.
                    </p>
                  </div>
                  <Button onClick={handleReceive} loading={receive.isPending} style={{ width: '100%' }}>
                    <Inbox size={15} /> Receber chamado
                  </Button>
                </div>
              )}

              {temLinhaDoTempo(ticket.status) && (
                <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                  <LinhaDoTempo ticket={ticket} podeEscrever={meu} />
                </div>
              )}

              {executando && meu && (
                <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                  <ConclusaoBox ticket={ticket} temRegistro={temRegistro} />
                </div>
              )}

              {aguardandoFechamento && meu && (
                <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                  <CancelarConclusaoBox ticket={ticket} />
                </div>
              )}

              {ticket.status === 'CONCLUIDO' && (
                <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                  Finalizado{ticket.closed_by?.name ? ` por ${ticket.closed_by.name}` : ''} em {stampLabel(ticket.closed_at)}.
                </p>
              )}
            </div>
          </UnsavedScope>
        )}
      </Modal>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </>
  );
}
