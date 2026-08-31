'use client';
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, ClipboardList, FileText, Hourglass, Inbox } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { Badge } from '@/app/components/ui';
import { M, MPage, MTopBar, MCard, MButton, MButtonGhost } from '@/app/components/mobile/kit';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
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
import { R, MOTION } from '@/app/lib/theme';
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

  // O relato é a única chance de contar o que foi feito, e ele só sai daqui em
  // "Concluir serviço": trocar de fila remonta o cartão e o levaria junto.
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
            background: M.chip, border: '1px solid transparent', borderRadius: R.control,
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
  // Finalizado pelo moderador. Só passa a aparecer nesta tela com a aba de
  // concluídos — antes a lista parava em "aguardando o moderador".
  const closed = ticket.status === 'CONCLUIDO';

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
        color: M.text, fontSize: 14, lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {ticket.description}
      </p>

      {ticket.maintenance_note && (
        <div style={{ background: M.chip, borderRadius: R.control, padding: '11px 13px' }}>
          <p style={{ color: M.mute, fontSize: 12, marginBottom: 4 }}>Do moderador</p>
          <p style={{ color: M.text, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {ticket.maintenance_note}
          </p>
          {ticket.maintenance_cost !== null && ticket.maintenance_cost !== undefined && (
            <p style={{ color: M.mute, fontSize: 12, marginTop: 6 }}>
              Valor: {formatCost(ticket.maintenance_cost)}
            </p>
          )}
        </div>
      )}

      <p style={{ color: M.faint, fontSize: 12 }}>
        {labelOf(CATEGORIES, ticket.category)}
        {day ? ` · relatado em ${format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}` : ''}
      </p>

      {pending && (
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: R.control, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <Hourglass size={15} color={M.accentInk} style={{ flexShrink: 0 }} />
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
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: R.control, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <CheckCheck size={15} color={M.accentInk} style={{ flexShrink: 0, marginTop: 1 }} />
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

      {closed && (
        <div className="anim-scale-in" style={{ background: M.accentSoft, borderRadius: R.control, padding: '11px 13px', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <CheckCheck size={15} color={M.accentInk} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ color: M.text, fontSize: 12, lineHeight: 1.5 }}>
              Aprovado e finalizado pelo moderador
              {ticket.closed_at
                ? ` em ${format(new Date(ticket.closed_at), 'dd/MM/yyyy', { locale: ptBR })}`
                : ''}
              .
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
          não se conclui o que não se recebeu. E não existe mais depois de
          fechado: oferecer "concluir" num chamado encerrado convidaria a
          reabrir o que já acabou. */}
      {!pending && !waiting && !closed && <ConclusaoBox ticket={ticket} />}

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
 * As três filas do responsável.
 *
 * O mesmo chamado em três momentos: chegou e espera ele aceitar, está com ele,
 * ou acabou. Antes vinham todos numa pilha só, e o que precisava de um gesto se
 * perdia no meio do que já estava resolvido.
 *
 * A terceira junta o que ele concluiu com o que o moderador já aprovou de
 * propósito: para quem executou, os dois são "trabalho que terminei" — a
 * diferença é de quem fecha, e ela aparece dentro do cartão, não na fila.
 */
export const ABAS = [
  { id: 'RECEBER', label: 'A receber', status: ['ENCAMINHADO'] },
  { id: 'ANDAMENTO', label: 'Em andamento', status: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'] },
  { id: 'CONCLUIDOS', label: 'Concluídos', status: ['AGUARDANDO_FECHAMENTO', 'CONCLUIDO'] },
];

/**
 * De que lado a lista daquela fila entra.
 *
 * Do lado em que está o botão que a abriu: a fila da esquerda vem da esquerda,
 * a da direita vem da direita. É a pílula dourada continuando o movimento — os
 * cartões saem de debaixo dela, e não de um lugar qualquer.
 *
 * A do meio não tem lado, e sobe, que é como todas as listas do produto entram.
 * O que decide é de que lado do centro o botão está, e não o índice: com uma
 * quarta fila um dia, as duas do meio continuam subindo.
 */
export function entradaDaFila(id) {
  const posicao = ABAS.findIndex((aba) => aba.id === id);
  const centro = (ABAS.length - 1) / 2;

  if (posicao < 0 || posicao === centro) return 'anim-fade-up';
  return posicao < centro ? 'anim-slide-from-left' : 'anim-slide-from-right';
}

const VAZIO = {
  RECEBER: 'Nenhum chamado esperando você receber',
  ANDAMENTO: 'Nenhum chamado em andamento com você',
  CONCLUIDOS: 'Você ainda não concluiu nenhum chamado',
};

/** O trilho tem 4px de folga de cada lado; a pílula que corre ocupa o resto. */
const FOLGA_TRILHO = 4;

/**
 * O seletor de fila.
 *
 * Botões e não abas de navegação: trocar de fila não muda de tela nem de
 * endereço, e a lista já está toda na memória — mandar o telefone buscar de
 * novo a cada toque seria trabalho à toa.
 *
 * O número fica no próprio botão porque é ele que diz onde há trabalho: sem
 * isso, descobrir que a fila está vazia custa um toque.
 *
 * O dourado é uma peça só, que corre de uma fila à outra em vez de acender numa
 * e apagar na outra — é o mesmo alternador do histórico (ver
 * `HistoricoSwitcher`), e partilha com ele a curva do movimento. Acender e
 * apagar são dois eventos que a pessoa tem de juntar; o movimento já diz que é
 * o mesmo lugar que mudou de lado, e diz também de onde ela veio.
 *
 * Duas decisões que o movimento cobra, e que valem a nota:
 *
 * - As colunas são iguais (`grid-auto-columns: 1fr`) e sem vão entre elas. É o
 *   que deixa a pílula andar por porcentagem, sem medir nada no DOM. Com o vão
 *   de 6px que havia aqui, cada passo erraria o alvo por alguns pixels.
 * - O peso da fonte não muda com a seleção. "Em andamento" em 600 é mais larga
 *   que em 400: com o peso variando, o trilho mudava de largura no meio da
 *   viagem e a pílula chegava tremendo. Quem diz qual está aberta é a cor.
 */
export function SeletorFila({ abas, atual, onPick, contagem }) {
  const indice = Math.max(0, abas.findIndex((aba) => aba.id === atual));

  return (
    <div
      role="tablist"
      aria-label="Filas de chamados"
      style={{
        position: 'relative',
        display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr',
        background: M.card, borderRadius: 999,
        padding: FOLGA_TRILHO, marginBottom: 16,
      }}
    >
      {/*
        A pílula que corre.

        Fica atrás dos rótulos, e não dentro do botão ativo: dentro dele, ela
        nasceria e morreria a cada troca, e o que se veria seria um piscar. As
        medidas saem de porcentagem do próprio trilho — `100%` aqui é a caixa
        com o recuo, daí o desconto dos dois lados.
      */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: FOLGA_TRILHO, bottom: FOLGA_TRILHO, left: FOLGA_TRILHO,
          width: `calc((100% - ${FOLGA_TRILHO * 2}px) / ${abas.length})`,
          transform: `translateX(${indice * 100}%)`,
          background: M.accent, borderRadius: 999,
          transition: MOTION.slide,
        }}
      />

      {abas.map((aba) => {
        const ativo = aba.id === atual;
        return (
          <button
            key={aba.id}
            role="tab"
            aria-selected={ativo}
            onClick={() => onPick(aba.id)}
            style={{
              // `relative` põe o rótulo acima da pílula sem tirá-lo do grid:
              // é o empilhamento que faz o dourado passar por baixo do texto.
              position: 'relative',
              border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 999,
              padding: '9px 6px', fontFamily: M.display, fontSize: 13, fontWeight: 600,
              color: ativo ? M.onAccent : M.mute,
              // A cor troca em metade da viagem: a palavra escurece quando o
              // dourado já está debaixo dela, não antes de ele chegar.
              transition: 'color 130ms ease 90ms',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              whiteSpace: 'nowrap',
            }}
          >
            {aba.label}
            {contagem[aba.id] > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: ativo ? M.onAccent : M.faint,
                transition: 'color 130ms ease 90ms',
              }}>
                {contagem[aba.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A tela do responsável: o que foi encaminhado a ele, em todos os prédios.
 *
 * Ele não escolhe prédio: abre e vê o que é dele. Os gestos continuam dois, e
 * só eles — receber o que foi encaminhado e, depois, dizer que terminou; fechar
 * é do moderador. O que a tela ganhou foi separar em que ponto cada chamado
 * está, em vez de empilhar tudo.
 */
export default function ResponsavelPage() {
  const { user } = useAuthStore();
  // Com os finalizados: são eles que dão fim à terceira fila — sem isso ela
  // mostraria só o que ainda espera o moderador.
  const { data, isLoading } = useMyTickets(true, true);
  const tickets = data?.tickets ?? [];

  const [aba, setAba] = useState('RECEBER');

  // Cada fila monta os seus cartões do zero (ver a `key` da lista): trocar com
  // um relatório escrito e não enviado o apagaria.
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  const contagem = ABAS.reduce((acc, a) => {
    acc[a.id] = tickets.filter((t) => a.status.includes(t.status)).length;
    return acc;
  }, {});

  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const visiveis = tickets.filter((t) => abaAtual.status.includes(t.status));

  const entrada = entradaDaFila(abaAtual.id);

  /**
   * O que a pessoa lê antes do título.
   *
   * O que espera aceite vem primeiro porque é o único que depende de um gesto
   * dela agora — o resto já está com ela.
   */
  const eyebrow =
    contagem.RECEBER > 0
      ? `${contagem.RECEBER} para receber`
      : contagem.ANDAMENTO > 0
        ? `${contagem.ANDAMENTO} para atender`
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

        <SeletorFila
          abas={ABAS}
          atual={aba}
          // Tocar na fila que já está aberta não muda nada, e por isso não pergunta.
          onPick={(id) => id !== aba && saida.guard(() => setAba(id))}
          contagem={contagem}
        />

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="anim-fade-in animate-pulse" style={{ height: 150, background: M.card, borderRadius: R.card }} />
            ))}
          </div>
        )}

        {/* Duas ausências diferentes, e a diferença importa: quem nunca recebeu
            nada precisa saber que a tela funciona assim; quem tem chamados em
            outra fila só precisa saber que esta está vazia. */}
        {!isLoading && tickets.length === 0 && (
          <MCard className="anim-fade-up anim-d1" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <ClipboardList className="anim-pop-in anim-d2" size={34} color={M.faint} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontFamily: M.display, fontWeight: 600, fontSize: 16, color: M.text }}>
              Nenhum chamado com você
            </p>
            <p style={{ color: M.mute, fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              {user?.name?.split(' ')[0]}, quando o moderador encaminhar uma
              ocorrência para você, ela aparece aqui.
            </p>
          </MCard>
        )}

        {!isLoading && tickets.length > 0 && visiveis.length === 0 && (
          // O aviso de fila vazia ocupa o lugar dos cartões, e por isso entra
          // pelo mesmo lado que eles: `key` na fila para tocar a cada troca.
          <MCard key={abaAtual.id} className={`${entrada} anim-d1`} style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p style={{ color: M.mute, fontSize: 14, lineHeight: 1.6 }}>{VAZIO[abaAtual.id]}</p>
          </MCard>
        )}

        <UnsavedScope report={report}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visiveis.map((ticket, idx) => (
              <TicketCard
                // A fila entra na chave: sem isso o React reaproveita o cartão da
                // fila anterior, e o texto do relatório digitado num chamado
                // aparece em outro.
                key={`${abaAtual.id}-${ticket.id}`}
                ticket={ticket}
                className={`${entrada} anim-d${Math.min(idx + 1, 6)}`}
              />
            ))}
          </div>
        </UnsavedScope>

        <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />

        <BottomNav />
      </MPage>
    </RouteGuard>
  );
}
