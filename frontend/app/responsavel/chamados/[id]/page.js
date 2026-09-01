'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, CheckCheck, FileText, Hourglass, Inbox } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { Badge, Skeleton } from '@/app/components/ui';
import { M, MCard, MButton, MRound, CONTENT_ID, RESPIRO_TOPO } from '@/app/components/mobile/kit';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import { LinhaDoTempo, temLinhaDoTempo } from '@/app/components/LinhaDoTempo';
import { dayLabel, stampLabel } from '@/app/components/OcorrenciaModal';
import { useTicket, useTicketUpdates, useReceiveTicket, useReportTicketDone } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { R, W } from '@/app/lib/theme';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** Um par rótulo/valor, como o das caixas de ocorrência. */
function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: M.mute, fontSize: 12 }}>{label}</p>
      <div style={{ color: M.text, fontSize: 14, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/** Rótulo de bloco dentro da página. */
function Titulo({ children }) {
  return <h2 style={{ color: M.mute, fontSize: 12, marginBottom: 6 }}>{children}</h2>;
}

/**
 * O bloco de conclusão.
 *
 * Saiu do cartão da lista e veio para cá: concluir é o gesto que encerra o
 * trabalho de alguém, e ele estava ao lado de outros quatro chamados, num
 * botão que a pessoa podia acertar sem querer. Aqui ele fica no fim da história
 * que ela mesma escreveu.
 *
 * O relatório continua opcional e continua existindo ao lado da linha do tempo:
 * um é o passo a passo, o outro é o resumo que o moderador lê para decidir
 * fechar. Mas concluir passou a exigir ao menos um passo registrado — sem isso,
 * um chamado ia de "recebido" a "concluído" sem que uma linha do sistema
 * dissesse o que aconteceu no meio.
 */
function ConclusaoBox({ ticket, temRegistro }) {
  const reportDone = useReportTicketDone();
  const { show: toast } = useToastStore();
  const [report, setReport] = useState(ticket.done_report ?? '');

  useUnsavedField(report !== (ticket.done_report ?? ''));

  async function handleDone() {
    try {
      await reportDone.mutateAsync({ id: ticket.id, done_report: report.trim() });
      toast('Conclusão informada. O moderador vai fechar o chamado.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao informar conclusão', 'error');
    }
  }

  return (
    <MCard style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ color: M.mute, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={13} /> Relatório do serviço (se necessário)
        </span>
        <textarea
          rows={3}
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="O resumo do serviço: o que resolveu, o que ficou pendente…"
          style={{
            background: M.chip, border: `1px solid ${M.line}`, borderRadius: R.control,
            padding: '13px 15px', color: M.text, fontSize: 16, outline: 'none',
            width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
          }}
        />
      </label>

      <MButton
        onClick={handleDone}
        loading={reportDone.isPending}
        disabled={!temRegistro}
        style={{ width: '100%' }}
      >
        <CheckCheck size={15} /> Concluir serviço
      </MButton>

      {/* Diz o que falta e onde fazer, e não só que o botão está apagado. */}
      {!temRegistro && (
        <p style={{ color: M.faint, fontSize: 12, lineHeight: 1.6, textAlign: 'center' }}>
          Registre ao menos uma atualização acima antes de concluir.
        </p>
      )}
    </MCard>
  );
}

/**
 * A ocorrência inteira, em tela própria.
 *
 * Na lista, o cartão voltou a ser cartão: título, contexto, etiquetas e uma
 * seta. Tudo o que se faz num chamado passou para cá — e o que se faz num
 * chamado deixou de ser só "concluir". Ao longo dos dias, quem executa registra
 * o que fez, com hora e foto, e é esse registro que o moderador lê antes de
 * fechar.
 *
 * Tela, e não caixa, pelo mesmo motivo do histórico ampliado no telefone (ver
 * `historico/completo`): tem endereço próprio, o voltar do aparelho funciona, e
 * uma foto pode abrir por cima sem virar pilha de caixas.
 */
function TelaDaOcorrencia() {
  const router = useRouter();
  const { id } = useParams();
  const { user } = useAuthStore();
  const { show: toast } = useToastStore();

  const { data: ticket, isLoading, isError } = useTicket(id);
  const { data: updatesData } = useTicketUpdates(id, temLinhaDoTempo(ticket?.status));
  const receive = useReceiveTicket();

  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  async function handleReceive() {
    try {
      await receive.mutateAsync(id);
      toast('Chamado recebido. Ele está com você agora.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  const pendente = ticket?.status === 'ENCAMINHADO';
  const executando = ticket && ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'].includes(ticket.status);
  const meu = !!user?.id && ticket?.responsible_id === user.id;
  const temRegistro = (updatesData?.updates?.length ?? 0) > 0;

  return (
    <main id={CONTENT_ID} style={{ minHeight: '100vh', background: M.bg, paddingBottom: 40, overflowX: 'clip' }}>
      <header className="anim-fade-down" style={{ padding: `${RESPIRO_TOPO} 16px 18px`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <MRound label="Voltar aos meus chamados" onClick={() => saida.guard(() => router.back())}>
          <ArrowLeft size={18} />
        </MRound>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: M.faint, fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket?.report?.building?.name ?? 'Chamado'}
          </p>
          <h1 style={{ fontFamily: M.display, fontWeight: W.title, fontSize: 19, color: M.text, lineHeight: 1.2 }}>
            {ticket ? labelOf(MAINTENANCE_TYPES, ticket.maintenance_type) : 'Ocorrência'}
          </h1>
        </div>
      </header>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isLoading && [1, 2, 3].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: i === 2 ? 150 : 96, borderRadius: R.card }} />
        ))}

        {isError && (
          <MCard className="anim-fade-up" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>
              Chamado não encontrado
            </p>
            <p style={{ color: M.mute, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              Ele pode ter sido devolvido à fila, ou não estar mais com você.
            </p>
          </MCard>
        )}

        {ticket && (
          <UnsavedScope report={report}>
            <MCard className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Badge variant={RECORD_STATUS_VARIANT[ticket.status] ?? 'default'}>
                  {OCCURRENCE_STATUS_LABEL[ticket.status] ?? ticket.status}
                </Badge>
                <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
                  {labelOf(PRIORITIES, ticket.priority)}
                </Badge>
              </div>

              <div>
                <Titulo>O que está acontecendo</Titulo>
                <p style={{ color: M.text, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {ticket.description}
                </p>
              </div>

              {/* A grade guarda a identidade do chamado — de onde ele veio e de
                  quem é. O desfecho saiu daqui e virou compasso da linha do
                  tempo, que é onde ele acontece. */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14,
                borderTop: `1px solid ${M.line}`, paddingTop: 14,
              }}>
                <Fact label="Andar">{ticket.floor?.label ?? '—'}</Fact>
                <Fact label="Categoria">{labelOf(CATEGORIES, ticket.category)}</Fact>
                <Fact label="Relatado em">{dayLabel(ticket.report?.date)}</Fact>
                <Fact label="Vistoriado por">{ticket.report?.inspector?.name ?? '—'}</Fact>
                {ticket.forwarded_at && <Fact label="Encaminhado em">{stampLabel(ticket.forwarded_at)}</Fact>}
                {ticket.received_at && <Fact label="Recebido em">{stampLabel(ticket.received_at)}</Fact>}
                {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined && (
                  <Fact label="Gasto">{formatCost(ticket.maintenance_cost)}</Fact>
                )}
              </div>

              {ticket.maintenance_note && (
                <div style={{ background: M.chip, borderRadius: R.control, padding: '12px 14px' }}>
                  <p style={{ color: M.mute, fontSize: 12, marginBottom: 5 }}>Do moderador</p>
                  <p style={{ color: M.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {ticket.maintenance_note}
                  </p>
                </div>
              )}
            </MCard>

            {/* Encaminhado e ainda não recebido: um gesto só na tela, e é este.
                A linha do tempo nem existe antes dele. */}
            {pendente && meu && (
              <MCard className="anim-fade-up anim-d1" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <Hourglass size={15} color={M.accentInk} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ color: M.text, fontSize: 13, lineHeight: 1.6 }}>
                    Encaminhado a você
                    {ticket.forwarded_at
                      ? ` em ${format(new Date(ticket.forwarded_at), 'dd/MM/yyyy', { locale: ptBR })}`
                      : ''}
                    . Receba para começar a registrar o andamento.
                  </p>
                </div>
                <MButton onClick={handleReceive} loading={receive.isPending} style={{ width: '100%' }}>
                  <Inbox size={15} /> Receber chamado
                </MButton>
              </MCard>
            )}

            {temLinhaDoTempo(ticket.status) && (
              <MCard className="anim-fade-up anim-d1">
                <LinhaDoTempo ticket={ticket} podeEscrever={meu} />
              </MCard>
            )}

            {executando && meu && (
              <div className="anim-fade-up anim-d2">
                <ConclusaoBox ticket={ticket} temRegistro={temRegistro} />
              </div>
            )}
          </UnsavedScope>
        )}
      </div>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </main>
  );
}

export default function OcorrenciaDoResponsavelPage() {
  return (
    <RouteGuard roles={['RESPONSAVEL']}>
      <TelaDaOcorrencia />
    </RouteGuard>
  );
}
