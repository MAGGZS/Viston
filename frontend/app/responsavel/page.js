'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ClipboardList, Inbox } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { BottomNav } from '@/app/components/BottomNav';
import { Badge } from '@/app/components/ui';
import { M, MPage, MTopBar, MCard, MButton } from '@/app/components/mobile/kit';
import { useMyTickets, useReceiveTicket } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';
import { R, W, MOTION } from '@/app/lib/theme';
import { useAuthStore } from '@/app/store/auth';
import { useToastStore } from '@/app/store/toast';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/**
 * Um chamado encaminhado a esta pessoa.
 *
 * Tem a forma do cartão de ocorrência do histórico ampliado (ver
 * `HistoricoSwitcher`), e é de propósito: o mesmo objeto lido na mesma forma em
 * todo o produto. O que o distingue lá é ser leitura; aqui, ser trabalho — daí
 * o nome do prédio, que a lista do histórico não precisa porque já está dentro
 * de um, e o botão de receber.
 *
 * Antes ele carregava a descrição inteira, o bloco do moderador, três faixas de
 * estado e uma caixa de texto com o botão de concluir. Era formulário, não
 * cartão: no telefone, cada chamado empurrava os outros para fora da tela, e
 * concluir ficava a um toque de distância no meio de uma pilha. Tudo isso mudou
 * de lugar — o chamado tem tela própria agora, e é lá que se trabalha nele.
 *
 * A borda dourada segue sendo só do que espera aceite: é o único cartão em que
 * a pessoa ainda não fez nada.
 */
function TicketCard({ ticket, className = '' }) {
  const router = useRouter();
  const receive = useReceiveTicket();
  const { show: toast } = useToastStore();
  const pending = ticket.status === 'ENCAMINHADO';

  // O cartão inteiro é o botão que abre a tela do chamado, e este botão vive
  // dentro dele: sem parar a propagação, receber abriria a tela junto.
  async function handleReceive(event) {
    event.stopPropagation();

    try {
      await receive.mutateAsync(ticket.id);
      toast('Chamado recebido. Ele está com você agora.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao receber o chamado', 'error');
    }
  }

  const day = parseReportDate(ticket.report?.date);

  return (
    // O recuo mora no botão de dentro, e não no cartão: "Receber" é um segundo
    // botão, e botão dentro de botão não é HTML válido — o cartão inteiro tinha
    // de deixar de ser o elemento clicável para os dois caberem.
    <MCard
      className={className}
      style={{
        padding: 0, overflow: 'hidden',
        ...(pending ? { border: `1px solid ${M.accent}` } : {}),
      }}
    >
      <button
        type="button"
        onClick={() => router.push(`/responsavel/chamados/${ticket.id}`)}
        aria-label={`Abrir ${labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)} em ${ticket.floor?.label ?? 'andar não informado'}`}
        style={{
          display: 'flex', flexDirection: 'column', gap: 12, width: '100%', padding: 16,
          background: 'transparent', border: 'none', font: 'inherit', color: 'inherit',
          textAlign: 'left', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: M.text, fontWeight: W.title, fontSize: 14 }}>
              {ticket.floor?.label ?? 'Andar não informado'} ·{' '}
              {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
            </p>
            <p style={{ color: M.mute, fontSize: 12, marginTop: 2 }}>
              {ticket.report?.building?.name} · {labelOf(CATEGORIES, ticket.category)}
            </p>
            {day && (
              <p style={{ color: M.faint, fontSize: 12, marginTop: 2 }}>
                Relatado em {format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            )}
          </div>
          <ChevronRight size={18} color={M.faint} style={{ flexShrink: 0 }} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Badge variant={RECORD_STATUS_VARIANT[ticket.status] ?? 'default'}>
            {OCCURRENCE_STATUS_LABEL[ticket.status] ?? ticket.status}
          </Badge>
          <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'default'}>
            {labelOf(PRIORITIES, ticket.priority)}
          </Badge>
        </div>
      </button>

      {/* Receber é o único gesto que sobra na lista: é um toque, não tem o que
          escrever, e é ele que tira o chamado da espera. */}
      {pending && (
        <div style={{ borderTop: `1px solid ${M.line}`, margin: '0 16px', padding: '12px 0 16px' }}>
          <MButton onClick={handleReceive} loading={receive.isPending} style={{ width: '100%' }}>
            <Inbox size={15} /> Receber
          </MButton>
        </div>
      )}
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
 * diferença é de quem fecha, e ela aparece na etiqueta de estado, não na fila.
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

/**
 * A faixa em que a lista vive, recortada nas bordas da tela.
 *
 * Sem ela, o cartao que entra pela direita empurrava a pagina: 28px alem da
 * coluna e 12px alem da janela, e o telefone ganhava rolagem horizontal que
 * nao sumia depois. So a fila da direita bugava — deslocamento para a esquerda
 * nao gera rolagem nenhuma, e foi por isso que o defeito parecia ser da aba
 * "Concluidos".
 *
 * A margem negativa desfaz o recuo do `MPage` e o recuo volta aqui dentro: o
 * corte fica na borda da janela, a 16px do cartao parado. E o que faz o cartao
 * chegar de fora da tela em vez de aparecer inteiro numa pagina mais larga —
 * o efeito que se queria — e mantem o fio de 1px do `cardRing` longe do corte.
 *
 * `clip` e nao `hidden`: com `hidden` num eixo, o outro vira `auto`, e a faixa
 * viraria um contentor de rolagem propria no meio da tela.
 */
const FAIXA_LISTA = {
  margin: '0 -16px',
  padding: '0 16px',
  overflowX: 'clip',
};

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
 * Ele não escolhe prédio: abre e vê o que é dele, separado pelo ponto em que
 * cada chamado está.
 *
 * A lista é para achar, não para trabalhar. O único gesto que sobrou nela é
 * receber, que é um toque e não tem o que escrever; registrar o andamento e
 * concluir moraram aqui dentro e passaram para a tela do chamado, onde há
 * espaço para a história inteira dele. Fechar continua sendo do moderador.
 */
export default function ResponsavelPage() {
  const { user } = useAuthStore();
  // Com os finalizados: são eles que dão fim à terceira fila — sem isso ela
  // mostraria só o que ainda espera o moderador.
  const { data, isLoading } = useMyTickets(true, true);
  const tickets = data?.tickets ?? [];

  const [aba, setAba] = useState('RECEBER');

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

        {/* Trocar de fila não pergunta nada: desde que o relatório e as
            anotações passaram para a tela do chamado, não há texto digitado
            nesta lista para se perder. */}
        <SeletorFila abas={ABAS} atual={aba} onPick={setAba} contagem={contagem} />

        <div style={FAIXA_LISTA}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="anim-fade-in animate-pulse" style={{ height: 132, background: M.card, borderRadius: R.card }} />
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

        {/* A fila entra na chave para a lista inteira entrar de novo a cada
            troca — é ela que toca a animação de lado, e sem isso os cartões
            trocariam de conteúdo parados no lugar.

            Com prefixo: o aviso de fila vazia é irmão desta lista e usa a mesma
            fila na chave dele. Só com o id, os dois seriam `RECEBER` no mesmo
            nível, e o React descartaria um deles — a lista sumia. */}
        <div key={`lista-${abaAtual.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visiveis.map((ticket, idx) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              className={`${entrada} anim-d${Math.min(idx + 1, 6)}`}
            />
          ))}
        </div>
        </div>

        <BottomNav />
      </MPage>
    </RouteGuard>
  );
}
