'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCheck, Inbox, Plus, Search, Spline, UserCheck } from 'lucide-react';
import { ResponsavelShell } from '@/app/components/ResponsavelShell';
import { ResponsavelChamadoModal } from '@/app/components/ResponsavelChamadoModal';
import { RegistrarOcorrenciaModal } from '@/app/components/RegistrarOcorrenciaModal';
import { Badge, Button, Skeleton } from '@/app/components/ui';
import { ChipSelect, chipBase, CHIP_PAD } from '@/app/components/ChipSelect';
import { useMyTickets, useReceiveTicket } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES, PRIORITIES, labelOf } from '@/app/lib/maintenanceOptions';
import { PRIORITY_VARIANT, stampLabel } from '@/app/lib/chamadoFormat';
import {
  COLUNAS,
  ordenarColuna,
  prazo,
  prediosDaLista,
  textoDoPrazo,
} from '@/app/lib/chamadosDoResponsavel';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

const ICONE_DA_COLUNA = { RECEBER: Inbox, ANDAMENTO: Spline, MODERADOR: UserCheck, CONCLUIDOS: CheckCheck };

/** Quantos finalizados a coluna mostra antes de pedir "mostrar mais". */
const PASSO_FINALIZADOS = 20;

/** O carimbo que diz em que ponto o cartão está, coluna a coluna. */
function carimbo(colunaId, t) {
  if (colunaId === 'RECEBER') return `Encaminhado em ${stampLabel(t.forwarded_at)}`;
  if (colunaId === 'ANDAMENTO') return `Recebido em ${stampLabel(t.received_at)}`;
  if (colunaId === 'MODERADOR') return `Concluído em ${stampLabel(t.done_at)}`;
  return `Finalizado em ${stampLabel(t.closed_at)}`;
}

/**
 * O fio do prazo, no pé do cartão.
 *
 * Enche com o quanto do prazo já foi gasto — é o que mostra o chamado chegando
 * no limite antes de passar dele. O texto ao lado repete a notícia em palavras,
 * para ninguém depender da cor.
 */
function FioDoPrazo({ ticket }) {
  const p = prazo(ticket);
  if (p.dias === null || p.dias === undefined) return null;
  const cor = p.atrasado ? T.danger : p.em_risco ? T.accentInk : T.mute;
  const largura = `${Math.min(1, p.consumo) * 100}%`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div aria-hidden="true" style={{ flex: 1, height: 3, borderRadius: 999, background: T.chip, overflow: 'hidden' }}>
        <div style={{ width: largura, height: '100%', borderRadius: 999, background: cor }} />
      </div>
      <span style={{ color: p.atrasado ? T.danger : T.faint, fontSize: 11, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {p.atrasado && <AlertTriangle size={11} aria-hidden="true" />}
        {textoDoPrazo(ticket)}
      </span>
    </div>
  );
}

/**
 * Um chamado no quadro.
 *
 * O cartão inteiro abre a caixa do chamado. "Receber" fica no próprio cartão da
 * primeira coluna, como na lista do telefone: é um clique, não tem o que
 * escrever, e abrir a caixa só para isso seria trabalho à toa. Botão dentro de
 * botão não é HTML válido, por isso o cartão é um contêiner com dois botões, e
 * não um botão só.
 */
function Cartao({ ticket, colunaId, onAbrir, className }) {
  const receive = useReceiveTicket();
  const { show: toast } = useToastStore();
  const pendente = ticket.status === 'ENCAMINHADO';

  async function handleReceive() {
    try {
      await receive.mutateAsync(ticket.id);
      toast('Chamado recebido. Ele está com você agora.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  return (
    <div
      className={className}
      style={{
        background: T.card, borderRadius: R.control, overflow: 'hidden', flexShrink: 0,
        boxShadow: pendente ? `inset 0 0 0 1px ${T.accentLine}` : T.cardRing,
      }}
    >
      <button
        type="button"
        onClick={() => onAbrir(ticket)}
        className="linha-clicavel"
        aria-label={`Abrir ${labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)} em ${ticket.floor?.label ?? 'andar não informado'}`}
        style={{
          width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: 'transparent',
          font: 'inherit', color: 'inherit', padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {/* O título tem a linha só para ele: com o selo ao lado, a coluna
            estreita quebrava "3º andar · Elétrica" no meio. */}
        <span style={{ color: T.text, fontSize: 14, fontWeight: W.title, lineHeight: 1.35 }}>
          {ticket.floor?.label ?? 'Andar não informado'} · {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </span>

        <p className="clamp-2" style={{ color: T.mute, fontSize: 12, lineHeight: 1.5 }}>
          {ticket.description}
        </p>

        {/* Prédio e carimbo em linhas próprias: juntos, a coluna estreita
            cortava a data, que é justamente o que se lê aqui. */}
        <div style={{ color: T.faint, fontSize: 12, lineHeight: 1.5 }}>
          <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.report?.building?.name}</p>
          <p>{carimbo(colunaId, ticket)}</p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
            {labelOf(PRIORITIES, ticket.priority)}
          </Badge>
          {ticket.status === 'AGUARDANDO_TERCEIRO' && <Badge>Aguardando terceiro</Badge>}
        </div>

        {colunaId !== 'CONCLUIDOS' && <FioDoPrazo ticket={ticket} />}
      </button>

      {pendente && (
        <div style={{ borderTop: `1px solid ${T.line}`, padding: '10px 14px' }}>
          <Button onClick={handleReceive} loading={receive.isPending} style={{ width: '100%', padding: '8px 14px', fontSize: 13 }}>
            <Inbox size={14} /> Receber
          </Button>
        </div>
      )}
    </div>
  );
}

function Coluna({ coluna, tickets, isLoading, onAbrir }) {
  const [limite, setLimite] = useState(PASSO_FINALIZADOS);
  const Icone = ICONE_DA_COLUNA[coluna.id];
  const corta = coluna.id === 'CONCLUIDOS';
  const visiveis = corta ? tickets.slice(0, limite) : tickets;

  return (
    <section
      aria-labelledby={`coluna-${coluna.id}`}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: T.chip, borderRadius: R.card, padding: 12 }}
    >
      <header style={{ padding: '2px 4px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icone size={15} color={T.accentInk} strokeWidth={2} aria-hidden="true" />
          <h2 id={`coluna-${coluna.id}`} style={{ color: T.text, fontSize: 14, fontWeight: W.title, fontFamily: T.display }}>
            {coluna.titulo}
          </h2>
          <span style={{ color: T.faint, fontSize: 12 }}>{tickets.length}</span>
        </div>
        <p style={{ color: T.faint, fontSize: 12, marginTop: 4 }}>{coluna.descricao}</p>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, padding: 2 }}>
        {isLoading && [1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 118, borderRadius: R.control, flexShrink: 0 }} />)}

        {!isLoading && tickets.length === 0 && (
          <p style={{ color: T.faint, fontSize: 13, padding: '22px 6px', textAlign: 'center' }}>{coluna.vazio}</p>
        )}

        {visiveis.map((ticket, idx) => (
          <Cartao
            key={ticket.id}
            ticket={ticket}
            colunaId={coluna.id}
            onAbrir={onAbrir}
            className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
          />
        ))}

        {corta && tickets.length > limite && (
          <Button variant="secondary" onClick={() => setLimite((n) => n + PASSO_FINALIZADOS)} style={{ flexShrink: 0, padding: '8px 14px', fontSize: 13 }}>
            Mostrar mais ({tickets.length - limite})
          </Button>
        )}
      </div>
    </section>
  );
}

function Quadro() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading } = useMyTickets(true, true);
  const tickets = useMemo(() => data?.tickets ?? [], [data]);

  // Vazio é "todos", como no `ChipSelect` — a mesma convenção dos filtros das
  // mesas do moderador e do gestor.
  const [predio, setPredio] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [busca, setBusca] = useState('');
  const [registrando, setRegistrando] = useState(false);

  // A caixa aberta: o cartão clicado, ou o id que veio no endereço — é assim que
  // o sino e o link de um chamado no telefone chegam direto nele.
  const [aberto, setAberto] = useState(() => {
    const id = searchParams.get('abrir');
    return id ? { id, inicial: null } : null;
  });

  function fechar() {
    setAberto(null);
    if (searchParams.get('abrir')) router.replace('/responsavel/chamados', { scroll: false });
  }

  const predios = prediosDaLista(tickets);
  const termo = busca.trim().toLowerCase();

  const filtrados = tickets.filter((t) => {
    if (predio && t.report?.building?.id !== predio) return false;
    if (prioridade && t.priority !== prioridade) return false;
    if (!termo) return true;
    const alvo = [
      t.description,
      t.floor?.label,
      t.report?.building?.name,
      labelOf(MAINTENANCE_TYPES, t.maintenance_type),
    ].join(' ').toLowerCase();
    return alvo.includes(termo);
  });

  const filtrando = predio !== '' || prioridade !== '' || termo !== '';

  return (
    <ResponsavelShell
      title="Chamados"
      subtitle="Tudo o que foi encaminhado a você, na ordem em que o chamado anda"
      actions={
        <button type="button" onClick={() => setRegistrando(true)} className="flex items-center gap-2 px-4 py-2 bg-chip rounded-control text-mute text-sm hover:text-ink transition-colors flex-shrink-0">
          <Plus size={15} /> Registrar ocorrência
        </button>
      }
    >
      {/* Os filtros têm a medida dos chips das outras mesas (ver
          `FiltrosChamados`): uma linha baixa acima do quadro, e não um
          formulário disputando altura com as colunas. */}
      <div role="group" aria-label="Filtrar os chamados" style={{ padding: '0 32px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <label style={{ ...chipBase, gap: 7, padding: CHIP_PAD, height: 34, width: 280, ...(termo ? { background: T.accentSoft } : {}) }}>
          <Search size={14} color={termo ? T.accentInk : T.faint} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span className="sr-only">Buscar chamados</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar andar, tipo ou descrição"
            style={{
              flex: 1, minWidth: 0, height: 17, padding: 0, background: 'none', border: 'none', outline: 'none',
              color: T.text, fontSize: 13, lineHeight: '17px', fontFamily: 'inherit',
            }}
          />
        </label>

        {predios.length > 1 && (
          <ChipSelect
            label="Prédio"
            todos="Todos os prédios"
            options={predios.map((b) => ({ value: b.id, label: b.name }))}
            value={predio}
            onChange={setPredio}
          />
        )}

        <ChipSelect label="Prioridade" todos="Todas as prioridades" options={PRIORITIES} value={prioridade} onChange={setPrioridade} />

        {filtrando && (
          <button
            type="button"
            onClick={() => { setPredio(''); setPrioridade(''); setBusca(''); }}
            style={{ background: 'none', border: 'none', color: T.accentInk, fontSize: 13, cursor: 'pointer', padding: '4px 6px' }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div
        className="anim-fade-up"
        style={{
          flex: 1, minHeight: 0, padding: '0 32px 28px',
          // 210 de mínimo: as quatro colunas cabem inteiras a partir de 1280px com o
          // menu aberto. Abaixo disso o quadro rola de lado, como todo kanban.
          display: 'grid', gridTemplateColumns: 'repeat(4, minmax(210px, 1fr))', gap: 14,
          overflowX: 'auto',
        }}
      >
        {COLUNAS.map((coluna) => (
          <Coluna
            key={coluna.id}
            coluna={coluna}
            isLoading={isLoading}
            tickets={ordenarColuna(coluna.id, filtrados.filter((t) => coluna.status.includes(t.status)))}
            onAbrir={(t) => setAberto({ id: t.id, inicial: t })}
          />
        ))}
      </div>

      <ResponsavelChamadoModal
        open={!!aberto}
        ticketId={aberto?.id}
        inicial={aberto?.inicial}
        onClose={fechar}
      />

      <RegistrarOcorrenciaModal open={registrando} onClose={() => setRegistrando(false)} />
    </ResponsavelShell>
  );
}

/**
 * O quadro do responsável, no computador.
 *
 * As mesmas filas do telefone lado a lado — o que chega, o que está com ele, o
 * que espera o moderador e o que acabou —, e o chamado inteiro numa caixa por
 * cima. Não se arrasta cartão entre colunas: cada passagem tem regra (concluir
 * exige um registro na linha do tempo, fechar é do moderador), e arrastar
 * prometeria um gesto que o chamado nem sempre aceita.
 *
 * O `Suspense` é por causa do `useSearchParams` (o `?abrir=`).
 */
export default function ChamadosDoResponsavelPage() {
  return (
    <Suspense fallback={null}>
      <Quadro />
    </Suspense>
  );
}
