'use client';
import { useRef, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck, Inbox, Send } from 'lucide-react';
import { Button, Select, Skeleton } from '@/app/components/ui';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedScope, useUnsavedField, useUnsavedGuard, useUnsavedScope } from '@/app/hooks/useUnsavedGuard';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { parseReportDate } from '@/app/lib/date';
import { useTickets, useBuildingResponsibles, useForwardTicket } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * A cor de cada prioridade, e ela é a mesma do resto do produto.
 *
 * Aqui a cor sai da etiqueta e vai para um filete na borda da linha. Etiqueta é
 * coisa que se lê; filete é coisa que se vê de relance — e numa fila de triagem
 * o que a pessoa faz primeiro é varrer a coluna procurando o que não pode
 * esperar. `PRIORITIES` continua sendo a fonte do rótulo.
 */
const COR_PRIORIDADE = {
  ALTA: 'var(--color-danger)',
  MEDIA: 'var(--color-accent)',
  BAIXA: 'var(--color-faint)',
};

/**
 * Quantos dias uma ocorrência pode esperar antes de a espera virar problema.
 *
 * Não é um prazo do produto, é a leitura da fila: uma alta parada há três dias
 * é pior notícia que uma baixa parada há duas semanas, e uma fila que pinta as
 * duas do mesmo jeito não ajuda a decidir por onde começar. É o único número
 * inventado desta tela, e está aqui para poder ser discutido num lugar só.
 */
const LIMITE_ESPERA = { ALTA: 2, MEDIA: 7, BAIXA: 15 };

/** O dia em que a ocorrência entrou na fila — o da vistoria que a abriu. */
function diaDeEntrada(ticket) {
  return parseReportDate(ticket.report?.date) ?? (ticket.created_at ? new Date(ticket.created_at) : null);
}

/**
 * Há quanto tempo a ocorrência espera, e se essa espera já passou do ponto.
 *
 * O número é o que a fila tem de dizer antes de qualquer outra coisa: chamado
 * novo é chamado que ninguém encaminhou, e o que mede a saúde desta tela é há
 * quanto tempo ninguém o fez.
 */
function espera(ticket) {
  const dia = diaDeEntrada(ticket);
  if (!dia) return { dias: null, texto: '—', atrasado: false };

  const dias = Math.max(0, differenceInCalendarDays(new Date(), dia));
  const atrasado = dias > (LIMITE_ESPERA[ticket.priority] ?? 7);

  return {
    dias,
    texto: dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`,
    atrasado,
  };
}

/** O dia por extenso, como nas demais telas de ocorrência. */
function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/**
 * O resumo da fila, acima da lista.
 *
 * Uma fila de triagem sem número é uma fila de tamanho desconhecido: dá para
 * rolar e descobrir, mas descobrir custa. As três frases respondem as três
 * perguntas de quem abre a tela — quanto tem, quanto é urgente, e o que já
 * esperou demais.
 */
function ResumoDaFila({ tickets }) {
  const altas = tickets.filter((t) => t.priority === 'ALTA').length;
  const atrasados = tickets.filter((t) => espera(t).atrasado).length;

  const partes = [
    `${tickets.length} ${tickets.length === 1 ? 'ocorrência esperando' : 'ocorrências esperando'}`,
    altas > 0 && `${altas} de prioridade alta`,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <p style={{ color: T.mute, fontSize: 13 }}>{partes.join(' · ')}</p>

      {/* A única coisa nesta tela que pede socorro ganha a cor de quem pede. */}
      {atrasados > 0 && (
        <span
          className="anim-fade-in"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: T.dangerSoft, color: T.danger,
            borderRadius: R.badge, padding: '4px 10px', fontSize: 12, fontWeight: W.strong,
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: T.danger }} />
          {atrasados === 1 ? '1 esperando demais' : `${atrasados} esperando demais`}
        </span>
      )}
    </div>
  );
}

/**
 * Uma ocorrência na fila.
 *
 * Três informações, nesta ordem: quanto corre (o filete), o que é (o título) e
 * há quanto tempo espera (a direita). A descrição vem em uma linha, e não em
 * duas: ela é prosa de quem vistoriou, quase sempre começa igual, e duas linhas
 * dela empurram para fora da tela a próxima ocorrência — que é o que a pessoa
 * está procurando.
 *
 * O filete de prioridade ocupa a borda que antes marcava a seleção. A seleção
 * passou a ser o fundo mais claro e o texto cheio: são dois sinais diferentes e
 * eles não cabiam no mesmo pixel.
 */
function LinhaDaFila({ ticket, ativa, onClick, onKeyDown, className = '' }) {
  const { texto, atrasado } = espera(ticket);

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-id={ticket.id}
      aria-current={ativa ? 'true' : undefined}
      className={className}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: ativa ? T.chip : T.card,
        borderRadius: R.control,
        // O filete e o recuo do texto: `paddingLeft` maior deixa a cor respirar
        // sem que ela encoste na primeira letra.
        borderLeft: `3px solid ${COR_PRIORIDADE[ticket.priority] ?? T.faint}`,
        padding: '12px 14px 12px 13px',
        display: 'flex', flexDirection: 'column', gap: 6,
        // Só a cor de fundo: `all` arrastaria o filete e o layout junto.
        transition: 'background-color 140ms ease',
      }}
      onMouseEnter={(e) => { if (!ativa) e.currentTarget.style.backgroundColor = T.hover; }}
      onMouseLeave={(e) => { if (!ativa) e.currentTarget.style.backgroundColor = T.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{
          color: T.text, fontSize: 14, fontWeight: W.title,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ticket.floor?.label} · {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </span>

        {/* Números tabulares: sem isso "há 3 dias" e "há 12 dias" desalinham a
            coluna inteira, e a varredura de cima a baixo perde o eixo. */}
        <span style={{
          color: atrasado ? T.danger : T.faint, fontSize: 12, flexShrink: 0,
          fontWeight: atrasado ? W.strong : W.body,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {texto}
        </span>
      </div>

      <p style={{
        color: T.mute, fontSize: 12, lineHeight: 1.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {ticket.description}
      </p>

      <p style={{ color: T.faint, fontSize: 11 }}>
        {labelOf(PRIORITIES, ticket.priority)} · {labelOf(CATEGORIES, ticket.category)}
      </p>
    </button>
  );
}

/** Um par rótulo/valor do detalhe. */
function Fact({ label, children }) {
  return (
    <div>
      <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
      <div style={{ color: T.text, fontSize: 14, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/**
 * A decisão, numa barra que não sai da tela.
 *
 * Era o último bloco de um painel comprido, depois da descrição e da grade de
 * datas: a única coisa que esta tela existe para fazer ficava atrás de uma
 * rolagem. Agora ela é uma barra colada ao pé do painel — o conteúdo passa por
 * baixo, e o gesto está sempre a um olhar de distância.
 *
 * Encaminhar é o gesto primário desta fila e por isso é o botão dourado. Não há
 * um segundo botão ao lado: nesta tela não existe outra coisa a fazer com a
 * ocorrência, e inventar uma opção secundária só faria a pessoa parar para
 * escolher entre uma e nenhuma.
 */
function BarraDeDecisao({ ticket, buildingId }) {
  const { data: responsibles = [], isLoading } = useBuildingResponsibles(buildingId);
  const forward = useForwardTicket();
  const { show: toast } = useToastStore();
  const [escolhido, setEscolhido] = useState('');

  // Escolher a pessoa e trocar de ocorrência sem enviar perde a escolha.
  useUnsavedField(escolhido !== '');

  const semResponsaveis = !isLoading && responsibles.length === 0;

  async function encaminhar() {
    if (!escolhido) {
      toast('Escolha quem vai atender', 'error');
      return;
    }

    try {
      await forward.mutateAsync({ id: ticket.id, responsible_id: escolhido });
      toast('Chamado encaminhado. Ele agora espera o aceite.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao encaminhar', 'error');
    }
  }

  return (
    <div
      style={{
        position: 'sticky', bottom: 0,
        // `auto` no topo empurra a barra para o pé quando o conteúdo é curto; os
        // recuos negativos a fazem encostar nas bordas do painel, e o `padding`
        // devolve o respiro por dentro. Sem eles sobraria uma tira do fundo do
        // painel de cada lado, e o conteúdo apareceria rolando por ela.
        //
        // Numa propriedade só: `marginTop` seguido do atalho `margin` seria
        // apagado por ele, e a barra subiria para o meio do painel vazio.
        margin: 'auto -26px -26px', padding: '16px 26px',
        background: T.card, borderTop: `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {semResponsaveis ? (
        <p style={{ color: T.mute, fontSize: 13, lineHeight: 1.6 }}>
          Este prédio ainda não tem ninguém com o papel de responsável. O gestor
          define os papéis em Colaboradores — sem isso não há a quem encaminhar.
        </p>
      ) : (
        <>
          {/* O rótulo vem por prop, e não num `<label>` em volta: o gatilho do
              `Select` é um botão com semântica de combobox, e um `<label>` não
              nomeia botão nenhum — quem faz a ligação é o próprio componente. */}
          <Select
            label="Encaminhar para"
            options={responsibles.map((r) => ({ value: r.id, label: r.name }))}
            value={escolhido}
            onChange={(e) => setEscolhido(e.target.value)}
            placeholder={isLoading ? 'Carregando…' : 'Escolha quem vai atender'}
          />

          <Button
            onClick={encaminhar}
            loading={forward.isPending}
            disabled={!escolhido}
            style={{ width: '100%' }}
          >
            <Send size={15} /> Encaminhar
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * A ocorrência aberta: o que está acontecendo, e a quem mandar.
 *
 * Sem animação de entrada. Trocar de ocorrência acontece dezenas de vezes numa
 * sessão de triagem, e é o gesto que a seta do teclado repete — animar a troca
 * põe um atraso entre a tecla e a resposta justamente onde a pessoa está mais
 * atenta. O que muda de verdade é o conteúdo, e ele muda de uma vez.
 */
function Detalhe({ ticket, buildingId }) {
  const { texto, atrasado } = espera(ticket);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100%' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* A prioridade em texto e cor, e não numa etiqueta cinza: nesta fila
              ela é o que decide a ordem do trabalho, e a etiqueta neutra do
              resto do produto a escondia entre as outras. */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            color: T.text, fontSize: 12, fontWeight: W.strong,
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 999,
              background: COR_PRIORIDADE[ticket.priority] ?? T.faint,
            }} />
            {labelOf(PRIORITIES, ticket.priority)}
          </span>

          <span aria-hidden="true" style={{ color: T.line }}>|</span>

          <span style={{
            color: atrasado ? T.danger : T.mute, fontSize: 12,
            fontWeight: atrasado ? W.strong : W.body,
          }}>
            Esperando encaminhamento {texto}
          </span>
        </div>

        <h2 style={{ color: T.text, fontSize: 21, fontWeight: W.title, marginTop: 12, letterSpacing: '-0.01em' }}>
          {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </h2>
        <p style={{ color: T.mute, fontSize: 13, marginTop: 4 }}>
          {ticket.floor?.label} · {labelOf(CATEGORIES, ticket.category)}
        </p>
      </div>

      <div>
        <p style={{ color: T.mute, fontSize: 12, marginBottom: 7 }}>O que está acontecendo</p>
        <p style={{ color: T.text, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {ticket.description}
        </p>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16,
        borderTop: `1px solid ${T.line}`, paddingTop: 18,
      }}>
        <Fact label="Relatado em">{dayLabel(ticket.report?.date)}</Fact>
        <Fact label="Vistoriado por">{ticket.report?.inspector?.name ?? '—'}</Fact>
        <Fact label="Prédio">{ticket.report?.building?.name ?? '—'}</Fact>
      </div>

      <BarraDeDecisao ticket={ticket} buildingId={buildingId} />
    </div>
  );
}

/** O esqueleto da fila enquanto ela chega. */
function Esqueleto() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, padding: '0 32px 28px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: 84, borderRadius: R.control }} />
        ))}
      </div>
      <Skeleton className="anim-fade-in" style={{ borderRadius: R.card }} />
    </div>
  );
}

/**
 * A fila vazia — que aqui é uma boa notícia.
 *
 * "Nenhum chamado esperando encaminhamento" dizia a ausência; o que a pessoa
 * quer saber é que não sobrou nada com ela. Fila de triagem vazia é trabalho
 * terminado, e a tela devia parabenizar em vez de informar.
 */
function FilaVazia() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center' }}>
      <div
        className="anim-pop-in"
        style={{
          width: 56, height: 56, borderRadius: 999, background: T.chip,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}
      >
        <CheckCheck size={24} color={T.accentInk} />
      </div>
      <p className="anim-fade-up anim-d1" style={{ color: T.text, fontSize: 16, fontWeight: W.title }}>
        Fila limpa
      </p>
      <p className="anim-fade-up anim-d2" style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.6, maxWidth: 360 }}>
        Toda ocorrência aberta pelas vistorias já tem um responsável. As novas
        aparecem aqui assim que alguém vistoriar.
      </p>
    </div>
  );
}

/**
 * A fila de triagem do moderador: o que a vistoria abriu e ninguém encaminhou.
 *
 * A tela tem um trabalho só — decidir quem atende cada ocorrência e mandar —, e
 * o desenho todo sai daí. A lista à esquerda existe para varrer e escolher; o
 * painel à direita, para ler o suficiente e decidir; a barra colada ao pé dele,
 * para decidir sem procurar o botão.
 *
 * Três coisas que a versão anterior não dizia, e que são as três perguntas de
 * quem abre isto:
 *
 * - **Quanto tem na fila.** Não havia contagem: descobrir custava rolar.
 * - **O que é urgente.** A prioridade vinha numa etiqueta cinza igual às
 *   outras. Agora é um filete colorido na borda da linha — coisa que se vê de
 *   relance, e não que se lê.
 * - **O que apodreceu.** Nada dizia há quanto tempo a ocorrência esperava, que
 *   é justamente o que uma fila de triagem existe para não deixar acontecer.
 *
 * As setas do teclado andam pela lista. Triagem é trabalho repetido — vinte
 * ocorrências numa sessão —, e obrigar a mão a sair do teclado a cada uma é o
 * tipo de atrito que só aparece na vigésima vez.
 */
export function ChamadosBoard({ buildingId }) {
  const { data, isLoading } = useTickets(buildingId, 'NOVOS');
  const tickets = data?.tickets ?? [];

  // A seleção é derivada: quando a lista muda — porque um chamado foi
  // encaminhado e saiu daqui — o escolhido deixa de existir e a tela volta
  // sozinha para o primeiro, sem efeito nenhum sincronizando estado.
  const [escolhido, setEscolhido] = useState(null);
  const aberta = tickets.find((t) => t.id === escolhido) ?? tickets[0] ?? null;
  const listaRef = useRef(null);

  // Trocar de ocorrência remonta o painel, e com ele some o responsável já
  // escolhido — por isso a troca passa pela mesma pergunta que fechar uma caixa.
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  function trocar(id) {
    if (id === aberta?.id) return;
    saida.guard(() => setEscolhido(id));
  }

  /**
   * As setas andam pela fila.
   *
   * No `onKeyDown` de cada linha, e não numa escuta na janela: a tela do
   * moderador tem barra lateral e campos, e uma escuta global roubaria as setas
   * de quem está dentro de um droplist. Presa ao botão, ela só existe enquanto o
   * foco está numa ocorrência.
   */
  function navegar(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    const i = tickets.findIndex((t) => t.id === aberta?.id);
    const proximo = tickets[e.key === 'ArrowDown' ? i + 1 : i - 1];
    if (!proximo) return;

    e.preventDefault();
    trocar(proximo.id);
    // O foco acompanha a seleção: sem isso a próxima seta continuaria saindo do
    // botão antigo, e o leitor de tela seguiria anunciando a ocorrência anterior.
    listaRef.current?.querySelector(`[data-id="${proximo.id}"]`)?.focus();
  }

  if (isLoading) return <Esqueleto />;
  if (tickets.length === 0) return <FilaVazia />;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '0 32px 28px' }}>
      <ResumoDaFila tickets={tickets} />

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20 }}>
        <div
          ref={listaRef}
          // `group`, e não `listbox`: numa listbox os filhos têm de ser
          // `option`, e `option` não é botão — a fila perderia o Enter e o
          // Espaço que o elemento nativo já dá de graça.
          role="group"
          aria-label="Ocorrências esperando encaminhamento"
          style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}
        >
          {tickets.map((ticket, idx) => (
            <LinhaDaFila
              key={ticket.id}
              ticket={ticket}
              ativa={ticket.id === aberta?.id}
              onClick={() => trocar(ticket.id)}
              onKeyDown={navegar}
              className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
            />
          ))}
        </div>

        <div style={{ overflowY: 'auto', background: T.card, borderRadius: R.card, padding: 26 }}>
          {/* `key` no chamado: o responsável escolhido nasce vazio a cada
              ocorrência, e trocar de linha tem de limpá-lo — não carregar para a
              seguinte a escolha feita para a anterior. */}
          {aberta ? (
            <UnsavedScope report={report}>
              <Detalhe key={aberta.id} ticket={aberta} buildingId={buildingId} />
            </UnsavedScope>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.mute, fontSize: 14, gap: 8 }}>
              <Inbox size={16} /> Escolha uma ocorrência à esquerda
            </div>
          )}
        </div>
      </div>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </div>
  );
}
