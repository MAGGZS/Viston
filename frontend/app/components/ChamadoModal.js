'use client';
import { useState } from 'react';
import { CheckCheck, Hourglass, Send, Undo2 } from 'lucide-react';
import { Badge, Button, Modal, Select } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import { LinhaDoTempo, temLinhaDoTempo } from '@/app/components/LinhaDoTempo';
import { CancelarConclusaoBox } from '@/app/components/CancelarConclusaoBox';
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
import { useAuthStore } from '@/app/store/auth';
import { roleIn } from '@/app/lib/roles';
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

  // Trocar quem recebe e fechar a caixa sem enviar perde a escolha: ela conta
  // como formulário mexido, como o texto da nota logo abaixo.
  useUnsavedField(picked !== (ticket.responsible_id ?? ''));

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
  /**
   * O que está gravado, na conta deste bloco.
   *
   * Sai do chamado uma vez, na montagem — a caixa é remontada a cada abertura,
   * então é sempre o chamado que está na tela —, e depois é este bloco quem o
   * atualiza, ao salvar. Comparar direto com `ticket.maintenance_note` custava
   * dois enganos: o texto vai *aparado* para o servidor, então "trocar a
   * lâmpada " nunca mais se igualava ao que ficou gravado; e a igualdade só
   * chegava quando a lista recarregasse, que é depois e pode nem acontecer. Nos
   * dois casos a caixa se despedia com "descartar alterações?" de nota já
   * salva. Mesma armadilha, e mesmo conserto, em ChamadosBoard.
   */
  const [gravado, setGravado] = useState(ticket.maintenance_note ?? '');
  const [note, setNote] = useState(gravado);

  // A nota só existe no servidor depois de "Salvar nota": até lá, fechar a
  // caixa a apagaria sem aviso.
  useUnsavedField(note !== gravado);

  async function handleSave() {
    const nota = note.trim() === '' ? null : note.trim();

    try {
      await update.mutateAsync({ id: ticket.id, maintenance_note: nota });
      setNote(nota ?? '');
      setGravado(nota ?? '');
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
  // O escopo é o que liga a nota e o reenvio, que moram em blocos filhos, à
  // saída, que é daqui: sem ele cada bloco teria de subir o seu estado só para
  // a caixa poder perguntar antes de fechar.
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);
  const { user } = useAuthStore();

  // `MODERADOR` estrito, e não `canModerate`: é o único lugar em que o gestor
  // não entra junto. A linha do tempo é o registro de quem põe a mão na
  // manutenção; quem administra o prédio a lê e fecha o chamado com base nela.
  const podeAnotar = roleIn(user, buildingId) === 'MODERADOR';

  if (!ticket) return null;

  const executando = EXECUTANDO.includes(ticket.status);
  const aguardandoFechamento = ticket.status === 'AGUARDANDO_FECHAMENTO';
  const encaminhado = ticket.status === 'ENCAMINHADO';

  return (
    <>
      <Modal open={open} onClose={() => saida.guard(onClose)} title={null} maxWidth={520}>
        <UnsavedScope report={report}>
          {/* A rolagem de caixa alta mora no `Modal` agora, e vale para todas —
              esta caixa foi só a primeira a precisar dela. A lista suspensa do
              Select não é cortada por isso: ela vive num portal preso ao
              `<dialog>`, e se reposiciona ao rolar. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {/* "Concluído em" saiu da grade: ele é o último passo da linha do
                  tempo aqui embaixo, com o relato do responsável junto. */}
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

            {/* O passo a passo de quem executou — o que há para validar antes
                de fechar, e o que faltava aqui: esta caixa mostrava carimbos de
                data e um parágrafo final, e o trabalho no meio não aparecia em
                lugar nenhum.

                A faixa "fulano concluiu em tal dia", com o relato junto, era um
                bloco próprio logo acima. Virou o último passo da linha — que é
                onde quem lê já está procurando o que validar. */}
            {temLinhaDoTempo(ticket.status) && (
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                <LinhaDoTempo ticket={ticket} podeEscrever={podeAnotar} />
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
                {/* A saída de quem lê a entrega e vê que falta coisa. Sem ela, a
                    única forma de destravar a linha do tempo seria reencaminhar
                    — que zera o recebimento e faz o chamado parecer novo para
                    quem já estava nele. */}
                <CancelarConclusaoBox ticket={ticket} />
                <Button onClick={() => onFinalizar?.(ticket)} style={{ width: '100%' }}>
                  <CheckCheck size={15} /> Finalizar
                </Button>
              </div>
            )}
          </div>
        </UnsavedScope>
      </Modal>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </>
  );
}
