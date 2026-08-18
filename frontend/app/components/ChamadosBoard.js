'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, Building2, CheckCheck, Send } from 'lucide-react';
import { Badge, Button, Select, Spinner } from '@/app/components/ui';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  RECORD_STATUS,
  RECORD_STATUS_VARIANT,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';
import {
  useTickets,
  useBuildingResponsibles,
  useForwardTicket,
  useUpdateTicket,
  useCloseTicket,
} from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/** Só o dia: o relatório inteiro passou a ser do dia, e a hora não dizia nada. */
function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/** Dia de um carimbo do chamado (encaminhado, concluído, fechado). */
function stampLabel(value) {
  return value ? format(new Date(value), 'dd/MM/yyyy', { locale: ptBR }) : '—';
}

/** Uma linha da lista: o suficiente para escolher qual abrir. */
function TicketRow({ ticket, active, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={className}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: active ? T.chip : T.card,
        borderLeft: `3px solid ${active ? T.accent : 'transparent'}`,
        borderRadius: R.control, padding: '13px 15px',
        display: 'flex', flexDirection: 'column', gap: 7,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.chip; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = T.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: T.text, fontSize: 13, fontWeight: W.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.floor?.label} · {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </span>
        <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
          {labelOf(PRIORITIES, ticket.priority)}
        </Badge>
      </div>

      <p style={{
        color: T.mute, fontSize: 12, lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {ticket.description}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.faint, fontSize: 11 }}>
        <span>{dayLabel(ticket.report?.date)}</span>
        <span>·</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.responsible ?? 'Sem responsável'}
        </span>
      </div>
    </button>
  );
}

/** Um par rótulo/valor do detalhe. */
function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: T.mute, fontSize: 11 }}>{label}</p>
      <div style={{ color: T.text, fontSize: 13, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/**
 * Encaminhar o chamado.
 *
 * O droplist traz só os responsáveis daquele prédio. Trocar de responsável com
 * o chamado já correndo passa pelo mesmo botão — é a mesma decisão, tomada de
 * novo.
 */
function ForwardBox({ ticket, buildingId, label }) {
  const { data: responsibles = [] } = useBuildingResponsibles(buildingId);
  const forward = useForwardTicket();
  const { show: toast } = useToastStore();
  const [picked, setPicked] = useState(ticket.responsible_id ?? '');

  const options = responsibles.map((r) => ({ value: r.id, label: r.name }));

  async function handleForward() {
    if (!picked) return toast('Selecione o responsável', 'error');
    try {
      await forward.mutateAsync({ id: ticket.id, responsible_id: picked });
      toast('Chamado encaminhado', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao encaminhar', 'error');
    }
  }

  if (responsibles.length === 0) {
    return (
      <div style={{ background: T.chip, borderRadius: R.control, padding: 14, display: 'flex', gap: 10 }}>
        <AlertTriangle size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
          Este prédio ainda não tem responsáveis. Peça ao gestor para vincular
          alguém como responsável em Colaboradores.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Select
        label={label}
        options={options}
        value={picked}
        placeholder="Selecione o responsável"
        onChange={(e) => setPicked(e.target.value)}
      />
      <Button onClick={handleForward} loading={forward.isPending} style={{ width: '100%' }}>
        <Send size={14} /> {ticket.forwarded_at ? 'Reencaminhar' : 'Encaminhar'}
      </Button>
    </div>
  );
}

/**
 * O que o moderador acrescenta ao chamado em andamento: a manutenção necessária
 * e o valor dela.
 */
function MaintenanceBox({ ticket }) {
  const update = useUpdateTicket();
  const { show: toast } = useToastStore();
  const [note, setNote] = useState(ticket.maintenance_note ?? '');
  const [cost, setCost] = useState(
    ticket.maintenance_cost === null || ticket.maintenance_cost === undefined
      ? ''
      : String(ticket.maintenance_cost)
  );

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: ticket.id,
        maintenance_note: note.trim() === '' ? null : note.trim(),
        // Campo em branco apaga o valor lançado antes; não é zero.
        maintenance_cost: cost === '' ? null : Number(cost),
      });
      toast('Chamado atualizado', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao salvar', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: T.mute, fontSize: 11 }}>Manutenção necessária</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que precisa ser feito, o que ficou combinado…"
          style={{ background: T.chip, border: 'none', borderRadius: R.control, padding: '12px 14px', color: T.text, fontSize: 13, outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ color: T.mute, fontSize: 11 }}>Valor (R$)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0,00"
          style={{ background: T.chip, border: 'none', borderRadius: R.control, padding: '11px 14px', color: T.text, fontSize: 13, outline: 'none', width: '100%' }}
        />
      </label>

      <Button variant="secondary" onClick={handleSave} loading={update.isPending} style={{ width: '100%' }}>
        Salvar informações
      </Button>
    </div>
  );
}

/** O aviso de que o responsável já disse que terminou — o que o moderador valida. */
function DoneNotice({ ticket }) {
  if (ticket.status !== 'AGUARDANDO_FECHAMENTO') return null;

  return (
    <div className="anim-scale-in" style={{ background: T.accentSoft, borderRadius: R.control, padding: '12px 14px', display: 'flex', gap: 10 }}>
      <CheckCheck size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ color: T.text, fontSize: 12, lineHeight: 1.6 }}>
        Concluído por {ticket.responsible ?? 'responsável'} em {stampLabel(ticket.done_at)} —
        aguardando o seu fechamento.
      </p>
    </div>
  );
}

/** O detalhe do chamado escolhido: o que está acontecendo, e o que fazer com isso. */
function TicketDetail({ ticket, buildingId, group }) {
  // Sem `key` próprio aqui: quem remonta é o pai (ver ChamadosBoard), e é isso
  // que faz a folha da direita entrar de novo a cada ocorrência escolhida.
  const close = useCloseTicket();
  const { show: toast } = useToastStore();

  async function handleClose() {
    try {
      await close.mutateAsync(ticket.id);
      toast('Chamado fechado', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao fechar o chamado', 'error');
    }
  }

  return (
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
            {labelOf(PRIORITIES, ticket.priority)}
          </Badge>
          <Badge variant={RECORD_STATUS_VARIANT[ticket.status] ?? 'default'}>
            {labelOf(RECORD_STATUS, ticket.status)}
          </Badge>
        </div>
        <h2 style={{ color: T.text, fontSize: 19, fontWeight: W.title, marginTop: 10 }}>
          {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </h2>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
          {ticket.floor?.label} · {labelOf(CATEGORIES, ticket.category)}
        </p>
      </div>

      <div>
        <p style={{ color: T.mute, fontSize: 11, marginBottom: 6 }}>O que está acontecendo</p>
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {ticket.description}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
        <Fact label="Relatado em">{dayLabel(ticket.report?.date)}</Fact>
        <Fact label="Vistoriado por">{ticket.report?.inspector?.name ?? '—'}</Fact>
        <Fact label="Responsável">{ticket.responsible ?? 'Sem responsável'}</Fact>
        {ticket.forwarded_at && <Fact label="Encaminhado em">{stampLabel(ticket.forwarded_at)}</Fact>}
        {ticket.closed_at && <Fact label="Fechado em">{stampLabel(ticket.closed_at)}</Fact>}
        {ticket.closed_by && <Fact label="Fechado por">{ticket.closed_by.name}</Fact>}
      </div>

      <DoneNotice ticket={ticket} />

      {group === 'NOVOS' && (
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
          <ForwardBox ticket={ticket} buildingId={buildingId} label="Encaminhar para" />
        </div>
      )}

      {group === 'ANDAMENTO' && (
        <>
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18 }}>
            <MaintenanceBox ticket={ticket} />
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ForwardBox ticket={ticket} buildingId={buildingId} label="Trocar de responsável" />
            {/* Fechar é do moderador, e só dele: o responsável chega até
                "terminei" e para ali. */}
            <Button onClick={handleClose} loading={close.isPending} style={{ width: '100%' }}>
              <CheckCheck size={15} /> Fechar chamado
            </Button>
          </div>
        </>
      )}

      {group === 'CONCLUIDOS' && (ticket.maintenance_note || ticket.maintenance_cost !== null) && (
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ticket.maintenance_note && (
            <div>
              <p style={{ color: T.mute, fontSize: 11, marginBottom: 5 }}>Manutenção</p>
              <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {ticket.maintenance_note}
              </p>
            </div>
          )}
          <Fact label="Valor">{formatCost(ticket.maintenance_cost)}</Fact>
        </div>
      )}

      {group === 'ANDAMENTO' && ticket.maintenance_cost !== null && (
        <p style={{ color: T.faint, fontSize: 11 }}>
          Valor lançado: {formatCost(ticket.maintenance_cost)}
        </p>
      )}
    </div>
  );
}

const EMPTY = {
  NOVOS: 'Nenhum chamado esperando encaminhamento',
  ANDAMENTO: 'Nenhum chamado em andamento',
  CONCLUIDOS: 'Nenhum chamado fechado ainda',
};

/**
 * As três telas de chamado, que são a mesma tela.
 *
 * Histórico ocorrência por ocorrência, como o do inspetor é vistoria por
 * vistoria: a lista à esquerda, e o que está acontecendo naquela ocorrência à
 * direita. O que muda de uma tela para a outra é o que se pode fazer ali —
 * encaminhar, acompanhar, ou só ler.
 */
export function ChamadosBoard({ buildingId, group }) {
  const { data, isLoading } = useTickets(buildingId, group);
  const tickets = data?.tickets ?? [];

  // A seleção é derivada: quando a lista muda — porque um chamado foi
  // encaminhado e saiu daqui — o escolhido deixa de existir e a tela volta
  // sozinha para o primeiro, sem efeito nenhum sincronizando estado.
  const [picked, setPicked] = useState(null);
  const selected = tickets.find((t) => t.id === picked) ?? tickets[0] ?? null;

  if (isLoading) {
    return (
      <div className="anim-fade-in" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center' }}>
        <Building2 className="anim-pop-in" size={40} color={T.faint} style={{ marginBottom: 14 }} />
        <p className="anim-fade-up anim-d1" style={{ color: T.mute, fontSize: 14 }}>{EMPTY[group]}</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, padding: '0 32px 28px' }}>
      {/* Esquerda: o histórico de ocorrências */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {tickets.map((ticket, idx) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            active={ticket.id === selected?.id}
            onClick={() => setPicked(ticket.id)}
            className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
          />
        ))}
      </div>

      {/* Direita: a ocorrência aberta */}
      <div className="anim-fade-up anim-d2" style={{ overflowY: 'auto', background: T.card, borderRadius: 26, padding: 26 }}>
        {/* `key` no chamado: os campos do detalhe (responsável escolhido,
            manutenção, valor) nascem do chamado aberto, e trocar de ocorrência
            tem de recarregá-los — não manter o que estava digitado no anterior. */}
        {selected ? (
          <TicketDetail key={selected.id} ticket={selected} buildingId={buildingId} group={group} />
        ) : (
          <div className="anim-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.mute, fontSize: 13, gap: 8 }}>
            <ArrowRight size={15} /> Escolha uma ocorrência à esquerda
          </div>
        )}
      </div>
    </div>
  );
}
