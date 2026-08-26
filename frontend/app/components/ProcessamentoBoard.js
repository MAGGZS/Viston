'use client';
import { useState } from 'react';
import { Building2, CheckCheck, Send, Spline } from 'lucide-react';
import { Badge, Button, Spinner } from '@/app/components/ui';
import {
  MAINTENANCE_TYPES,
  PRIORITIES,
  labelOf,
  formatCost,
} from '@/app/lib/maintenanceOptions';
import { PRIORITY_VARIANT, dayLabel, stampLabel } from '@/app/lib/chamadoFormat';
import { useTickets, useForwardTicket } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { ChamadoModal } from '@/app/components/ChamadoModal';
import { FinalizarChamadoModal } from '@/app/components/FinalizarChamadoModal';
import { T, R, W } from '@/app/lib/theme';

/**
 * A mesa de processamento do moderador.
 *
 * Três filas que antes eram três telas. Elas viraram uma porque são o mesmo
 * trabalho visto em três momentos, e trocar de aba para descobrir se o
 * responsável já aceitou — ou já terminou — escondia justamente o que o
 * moderador precisa comparar. Encaminhados e em execução ficam lado a lado, na
 * ordem em que o chamado anda; embaixo, ocupando a largura toda, o que espera
 * decisão dele.
 *
 * O que espera decisão fica embaixo e não numa terceira coluna porque é a única
 * fila com ação imediata: as duas de cima são acompanhamento, esta é trabalho.
 */

/** Um chamado na coluna: o suficiente para reconhecer e decidir se abre. */
function TicketCard({ ticket, onClick, carimbo }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: T.card, borderRadius: R.control, padding: '13px 15px',
        display: 'flex', flexDirection: 'column', gap: 7, transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: T.text, fontSize: 14, fontWeight: W.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.faint, fontSize: 12 }}>
        <span>{carimbo(ticket)}</span>
        {ticket.responsible && (
          <>
            <span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.responsible}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

/** Uma das duas colunas de acompanhamento. */
function Coluna({ icon: Icon, titulo, descricao, tickets, isLoading, vazio, carimbo, onPick }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Icon size={16} color={T.accent} strokeWidth={2} />
        <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title, fontFamily: T.display }}>
          {titulo}
        </h2>
        <span style={{ color: T.faint, fontSize: 12 }}>{tickets.length}</span>
      </header>
      <p style={{ color: T.faint, fontSize: 12, marginTop: -6 }}>{descricao}</p>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        )}

        {!isLoading && tickets.length === 0 && (
          <p style={{ color: T.faint, fontSize: 13, padding: '22px 4px' }}>{vazio}</p>
        )}

        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} carimbo={carimbo} onClick={() => onPick(ticket)} />
        ))}
      </div>
    </section>
  );
}

/**
 * Uma linha do que espera decisão.
 *
 * Os dois botões ficam na própria linha, e não só dentro da caixa de detalhe:
 * quando são vinte chamados para despachar, abrir cada um para clicar em
 * finalizar transformaria o trabalho de um minuto em vinte.
 */
function AguardandoRow({ ticket, onAbrir, onFinalizar }) {
  const forward = useForwardTicket();
  const { show: toast } = useToastStore();

  async function handleReenviar(event) {
    event.stopPropagation();
    // Reenvio rápido volta para quem já estava com o chamado; trocar de pessoa
    // é decisão maior, e mora na caixa de detalhe.
    if (!ticket.responsible_id) {
      return toast('Este chamado não tem responsável — abra para escolher um', 'error');
    }
    try {
      await forward.mutateAsync({ id: ticket.id, responsible_id: ticket.responsible_id });
      toast(`Reenviado para ${ticket.responsible}`, 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao reenviar', 'error');
    }
  }

  return (
    <div
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
      style={{
        background: T.card, borderRadius: R.control, padding: '13px 15px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
            {ticket.floor?.label} · {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
          </span>
          <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
            {labelOf(PRIORITIES, ticket.priority)}
          </Badge>
        </div>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.description}
        </p>
        <p style={{ color: T.faint, fontSize: 12, marginTop: 5 }}>
          Concluído por {ticket.responsible ?? 'responsável'} em {stampLabel(ticket.done_at)}
          {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined
            ? ` · ${formatCost(ticket.maintenance_cost)}`
            : ''}
        </p>
      </div>

      {/* Cada botão segura o próprio clique. A barreira ficava aqui, numa `div`
          com `onClick` só para isso — e uma `div` que escuta clique sem ser
          alcançável pelo teclado é exatamente o que a regra de acessibilidade
          barra. Nos botões, que já são botões, o efeito é o mesmo e não há
          elemento novo no caminho de quem navega pelo Tab. */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="secondary" onClick={handleReenviar} loading={forward.isPending}>
          <Send size={14} /> Reenviar
        </Button>
        <Button onClick={(e) => { e.stopPropagation(); onFinalizar(ticket); }}>
          <CheckCheck size={14} /> Finalizar
        </Button>
      </div>
    </div>
  );
}

export function ProcessamentoBoard({ buildingId }) {
  const encaminhados = useTickets(buildingId, 'ENCAMINHADOS');
  const execucao = useTickets(buildingId, 'EXECUCAO');
  const aguardando = useTickets(buildingId, 'AGUARDANDO_FECHAMENTO');

  // Duas caixas, dois estados: abrir o detalhe e finalizar são caminhos
  // diferentes — dá para finalizar direto da linha, sem passar pelo detalhe.
  const [aberto, setAberto] = useState(null);
  const [finalizando, setFinalizando] = useState(null);

  const listaEncaminhados = encaminhados.data?.tickets ?? [];
  const listaExecucao = execucao.data?.tickets ?? [];
  const listaAguardando = aguardando.data?.tickets ?? [];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 28px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div className="anim-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 22 }}>
        <Coluna
          icon={Send}
          titulo="Encaminhados"
          descricao="Com responsável, aguardando ele confirmar o recebimento"
          tickets={listaEncaminhados}
          isLoading={encaminhados.isLoading}
          vazio="Nenhum chamado esperando aceite"
          carimbo={(t) => `Encaminhado em ${stampLabel(t.forwarded_at)}`}
          onPick={setAberto}
        />

        <Coluna
          icon={Spline}
          titulo="Em andamento"
          descricao="Recebidos pelo responsável e ainda em execução"
          tickets={listaExecucao}
          isLoading={execucao.isLoading}
          vazio="Nenhum chamado em execução"
          carimbo={(t) => `Recebido em ${stampLabel(t.received_at)}`}
          onPick={setAberto}
        />
      </div>

      <section className="anim-fade-up anim-d1" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${T.line}`, paddingTop: 22 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <CheckCheck size={16} color={T.accent} strokeWidth={2} />
          <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title, fontFamily: T.display }}>
            Concluídas pelo responsável
          </h2>
          <span style={{ color: T.faint, fontSize: 12 }}>{listaAguardando.length}</span>
        </header>
        <p style={{ color: T.faint, fontSize: 12, marginTop: -6 }}>
          O responsável informou que terminou. Finalizar encerra o chamado; reenviar devolve o trabalho a ele.
        </p>

        {aguardando.isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Spinner />
          </div>
        )}

        {!aguardando.isLoading && listaAguardando.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '38px 0', textAlign: 'center' }}>
            <Building2 size={32} color={T.faint} style={{ marginBottom: 12 }} />
            <p style={{ color: T.mute, fontSize: 13 }}>Nenhum chamado esperando o seu fechamento</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {listaAguardando.map((ticket) => (
            <AguardandoRow
              key={ticket.id}
              ticket={ticket}
              onAbrir={() => setAberto(ticket)}
              onFinalizar={setFinalizando}
            />
          ))}
        </div>
      </section>

      <ChamadoModal
        ticket={aberto}
        buildingId={buildingId}
        open={!!aberto}
        onClose={() => setAberto(null)}
        onFinalizar={(ticket) => { setAberto(null); setFinalizando(ticket); }}
      />

      <FinalizarChamadoModal
        ticket={finalizando}
        open={!!finalizando}
        onClose={() => setFinalizando(null)}
      />
    </div>
  );
}
