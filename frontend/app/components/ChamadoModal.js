'use client';
import { useState } from 'react';
import { CheckCheck, Hourglass, Send, Undo2 } from 'lucide-react';
import { Badge, Button, Modal, Select } from '@/app/components/ui';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  RECORD_STATUS,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { PRIORITY_VARIANT, dayLabel, stampLabel } from '@/app/lib/chamadoFormat';
import {
  useBuildingResponsibles,
  useForwardTicket,
  useUnforwardTicket,
  useUpdateTicket,
} from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * O chamado inteiro, numa caixa que abre sobre a mesa.
 *
 * A mesa de processamento mostra três filas ao mesmo tempo, e não há espaço
 * para um painel de detalhe fixo ao lado — era o desenho da tela antiga, de uma
 * fila só. Aqui o detalhe é sob demanda: clicar em qualquer ocorrência, de
 * qualquer coluna, abre o que está acontecendo nela.
 *
 * O que se pode fazer muda com o estado, e só isso muda:
 * encaminhado cancela o envio, em execução recebe notas, concluído pelo
 * responsável é finalizado ou devolvido.
 */

function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: T.faint, fontSize: 11, marginBottom: 3 }}>{label}</p>
      <p style={{ color: T.text, fontSize: 13 }}>{children}</p>
    </div>
  );
}

/** Manda o chamado de volta ao trabalho, para a mesma pessoa ou outra. */
function ReenviarBox({ ticket, buildingId, onDone }) {
  const { data: responsibles = [] } = useBuildingResponsibles(buildingId);
  const forward = useForwardTicket();
  const { show: toast } = useToastStore();
  // Já vem com quem está no chamado: reenviar quase sempre é para a mesma
  // pessoa, e obrigar a escolher de novo transformaria o caminho comum no
  // trabalhoso.
  const [picked, setPicked] = useState(ticket.responsible_id ?? '');

  const options = responsibles.map((r) => ({ value: r.id, label: r.name }));

  async function handleForward() {
    if (!picked) return toast('Selecione o responsável', 'error');
    try {
      await forward.mutateAsync({ id: ticket.id, responsible_id: picked });
      toast('Chamado reenviado', 'success');
      onDone?.();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao reenviar', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Select
        label="Reenviar para"
        options={options}
        value={picked}
        placeholder="Selecione o responsável"
        onChange={(e) => setPicked(e.target.value)}
      />
      <Button onClick={handleForward} loading={forward.isPending} style={{ width: '100%' }}>
        <Send size={14} /> Reenviar
      </Button>
    </div>
  );
}

/** As notas do moderador para quem está executando. */
function NotasBox({ ticket }) {
  const update = useUpdateTicket();
  const { show: toast } = useToastStore();
  const [note, setNote] = useState(ticket.maintenance_note ?? '');

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: ticket.id,
        maintenance_note: note.trim() === '' ? null : note.trim(),
      });
      toast('Nota salva', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar a nota', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: T.mute, fontSize: 12 }}>Notas para o responsável</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que precisa ser feito, o que ficou combinado…"
          style={{
            background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
            borderRadius: R.control, padding: '12px 14px', color: T.text, fontSize: 14,
            outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6,
          }}
        />
      </label>
      <Button variant="secondary" onClick={handleSave} loading={update.isPending} style={{ width: '100%' }}>
        Salvar nota
      </Button>
    </div>
  );
}

/** Desfaz o envio — só existe enquanto ninguém aceitou. */
function CancelarEnvioBox({ ticket, onDone }) {
  const unforward = useUnforwardTicket();
  const { show: toast } = useToastStore();

  async function handleCancel() {
    try {
      await unforward.mutateAsync(ticket.id);
      toast('Envio cancelado — o chamado voltou para novos', 'success');
      onDone?.();
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao cancelar o envio', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
        Cancelar devolve o chamado à fila de novos, sem responsável. Só vale
        enquanto ninguém confirmou o recebimento.
      </p>
      <Button variant="secondary" onClick={handleCancel} loading={unforward.isPending} style={{ width: '100%' }}>
        <Undo2 size={14} /> Cancelar envio
      </Button>
    </div>
  );
}

const EXECUTANDO = ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'];

export function ChamadoModal({ ticket, buildingId, open, onClose, onFinalizar }) {
  if (!ticket) return null;

  const executando = EXECUTANDO.includes(ticket.status);
  const aguardandoFechamento = ticket.status === 'AGUARDANDO_FECHAMENTO';
  const encaminhado = ticket.status === 'ENCAMINHADO';

  return (
    <Modal open={open} onClose={onClose} title={null} maxWidth={520}>
      {/* O `<dialog>` é `overflow: visible`, então conteúdo alto sairia da tela
          em vez de rolar — e um chamado com descrição longa, relato do
          responsável e caixa de reenvio passa fácil da altura da janela. A
          lista suspensa do Select não é cortada por isto: ela vive num portal
          preso ao `<dialog>`, e se reposiciona ao rolar. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
              {labelOf(PRIORITIES, ticket.priority)}
            </Badge>
            <Badge variant={RECORD_STATUS_VARIANT[ticket.status] ?? 'default'}>
              {labelOf(RECORD_STATUS, ticket.status)}
            </Badge>
          </div>
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: W.title, marginTop: 10 }}>
            {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
          </h2>
          <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
            {ticket.floor?.label} · {labelOf(CATEGORIES, ticket.category)}
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
          <Fact label="Responsável">{ticket.responsible ?? 'Sem responsável'}</Fact>
          {ticket.forwarded_at && <Fact label="Encaminhado em">{stampLabel(ticket.forwarded_at)}</Fact>}
          {ticket.received_at && <Fact label="Recebido em">{stampLabel(ticket.received_at)}</Fact>}
          {ticket.done_at && <Fact label="Concluído em">{stampLabel(ticket.done_at)}</Fact>}
          {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined && (
            <Fact label="Gasto">{formatCost(ticket.maintenance_cost)}</Fact>
          )}
        </div>

        {encaminhado && (
          <div className="anim-scale-in" style={{ background: T.accentSoft, borderRadius: R.control, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <Hourglass size={16} color={T.accentInk} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: T.text, fontSize: 12, lineHeight: 1.6 }}>
              Aguardando {ticket.responsible ?? 'o responsável'} confirmar o recebimento,
              desde {stampLabel(ticket.forwarded_at)}.
            </p>
          </div>
        )}

        {/* O relato do responsável é o que há para validar antes de finalizar:
            sem ele, fechar seria confiar numa data. */}
        {aguardandoFechamento && (
          <div className="anim-scale-in" style={{ background: T.accentSoft, borderRadius: R.control, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <CheckCheck size={16} color={T.accentInk} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ color: T.text, fontSize: 12, lineHeight: 1.6 }}>
                {ticket.responsible ?? 'O responsável'} concluiu em {stampLabel(ticket.done_at)}.
              </p>
              {ticket.done_report && (
                <p style={{ color: T.text, fontSize: 12, lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-wrap', borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
                  {ticket.done_report}
                </p>
              )}
            </div>
          </div>
        )}

        {encaminhado && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
            <CancelarEnvioBox ticket={ticket} onDone={onClose} />
          </div>
        )}

        {executando && (
          <>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
              <NotasBox ticket={ticket} />
            </div>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
              <ReenviarBox ticket={ticket} buildingId={buildingId} onDone={onClose} />
            </div>
          </>
        )}

        {aguardandoFechamento && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ReenviarBox ticket={ticket} buildingId={buildingId} onDone={onClose} />
            <Button onClick={() => onFinalizar?.(ticket)} style={{ width: '100%' }}>
              <CheckCheck size={15} /> Finalizar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
