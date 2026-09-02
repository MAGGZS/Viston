'use client';
import { useMemo, useRef, useState } from 'react';
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
import { floorRank } from '@/app/lib/floorOrder';
import { useTickets, useBuildingResponsibles, useForwardTicket, useUpdateTicket } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R, W } from '@/app/lib/theme';

/**
 * A mesa de triagem: o que a vistoria abriu e ninguém encaminhou ainda.
 *
 * A tela tem um trabalho só — ler a ocorrência, conferir se ela está enquadrada
 * certo, e mandar para quem atende. O desenho todo sai daí: os cartões ocupam a
 * área grande porque é neles que se escolhe, e a ficha ao lado é estreita e
 * fixa porque é sempre a mesma sequência de decisões, na mesma ordem.
 *
 * Duas marcas desenhadas carregam o que antes era texto, e cada uma responde
 * uma pergunta diferente:
 *
 * - **O medidor** (três barras subindo) é a gravidade declarada. Ele existe
 *   para tirar a prioridade do canal da cor: "média" era dourado, e dourado
 *   neste produto quer dizer "aja aqui" — a mesma tinta dizia duas coisas. Sem
 *   matiz, o dourado volta a ser só do cartão escolhido e do botão de
 *   encaminhar.
 * - **O prazo** (o fio no pé do cartão) é a paciência já gasta. `LIMITE_ESPERA`
 *   existia e ninguém enxergava: era um número usado para pintar um texto de
 *   vermelho depois que já era tarde. Como fio que enche, ele mostra a
 *   ocorrência chegando no limite antes de passar dele.
 *
 * A fila se lê de dois jeitos, e os dois são trabalho de verdade: por urgência,
 * que responde "o que faço agora", e por andar, que é como se despacha em
 * bloco — a mesma pessoa costuma pegar tudo de um andar de uma vez.
 */

/**
 * Quantos dias uma ocorrência pode esperar antes de a espera virar problema.
 *
 * Não é um prazo do produto, é a leitura da fila: uma alta parada há três dias
 * é pior notícia que uma baixa parada há duas semanas, e uma fila que pinta as
 * duas do mesmo jeito não ajuda a decidir por onde começar. É o único número
 * inventado desta tela, e está aqui para poder ser discutido num lugar só.
 */
const LIMITE_ESPERA = { ALTA: 2, MEDIA: 7, BAIXA: 15 };

/** Quantas barras do medidor acendem, e o quanto a fila ordena por isso. */
const NIVEL_PRIORIDADE = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

/**
 * A tinta da gravidade — e ela não inclui o dourado.
 *
 * Só a alta ganha cor própria: é a única que quer ser vista antes de ser lida.
 * Média e baixa se separam pelo número de barras acesas e pelo nível de texto,
 * que é hierarquia que o produto inteiro já usa.
 */
const TINTA_PRIORIDADE = { ALTA: T.danger, MEDIA: T.text, BAIXA: T.faint };

/** O dia em que a ocorrência entrou na fila — o da vistoria que a abriu. */
function diaDeEntrada(ticket) {
  return parseReportDate(ticket.report?.date) ?? (ticket.created_at ? new Date(ticket.created_at) : null);
}

/**
 * Há quanto tempo a ocorrência espera, e quanto do prazo dela já foi.
 *
 * `consumo` não tem teto de propósito: é ele que ordena a fila, e limitá-lo a 1
 * empataria uma alta parada há três dias com outra parada há um mês. Quem tem
 * teto é a barra, que não pode transbordar do cartão.
 */
function prazo(ticket) {
  const limite = LIMITE_ESPERA[ticket.priority] ?? 7;
  const dia = diaDeEntrada(ticket);
  if (!dia) return { dias: null, limite, consumo: 0, atrasado: false, texto: '—' };

  const dias = Math.max(0, differenceInCalendarDays(new Date(), dia));

  return {
    dias,
    limite,
    consumo: dias / limite,
    atrasado: dias > limite,
    texto: dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`,
  };
}

/** O dia por extenso, como nas demais telas de ocorrência. */
function dayLabel(value) {
  const date = parseReportDate(value);
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—';
}

/**
 * A ordem da fila de urgência.
 *
 * O que já passou do prazo vem primeiro, seja qual for a prioridade: é a única
 * coisa que uma fila de triagem existe para não deixar acontecer, e enterrá-la
 * atrás de três altas que chegaram hoje é como ela apodrece. Depois a
 * gravidade, que é o que decide entre duas ocorrências igualmente no prazo. E
 * só então o quanto cada uma já gastou do prazo dela — o desempate entre
 * iguais, que é onde o fio do cartão passa a ser o que se lê.
 */
function porUrgencia(a, b) {
  const pa = prazo(a);
  const pb = prazo(b);

  return (
    Number(pb.atrasado) - Number(pa.atrasado) ||
    (NIVEL_PRIORIDADE[b.priority] ?? 0) - (NIVEL_PRIORIDADE[a.priority] ?? 0) ||
    pb.consumo - pa.consumo
  );
}

/**
 * A fila partida por andar, do mais alto para o mais baixo.
 *
 * A ordem é a da vistoria (ver `floorRank`): quem despacha um andar inteiro
 * está refazendo mentalmente a ronda que abriu aquelas ocorrências, e inverter
 * a ordem obrigaria a traduzir uma na outra. Dentro do andar vale a urgência —
 * o mesmo critério do outro modo, para não haver duas ideias de "primeiro".
 */
function agruparPorAndar(tickets) {
  const grupos = new Map();

  for (const ticket of tickets) {
    const id = ticket.floor?.id ?? 'sem-andar';
    if (!grupos.has(id)) {
      grupos.set(id, { id, label: ticket.floor?.label ?? 'Sem andar', tickets: [] });
    }
    grupos.get(id).tickets.push(ticket);
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, tickets: [...g.tickets].sort(porUrgencia) }))
    .sort((a, b) => floorRank(b.label) - floorRank(a.label) || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
}

/**
 * O medidor de gravidade: três barras subindo, acesas até o nível.
 *
 * Escondido do leitor de tela porque a palavra ao lado já diz a mesma coisa —
 * um desenho anunciado duas vezes é ruído para quem ouve a tela.
 */
function Medidor({ priority, size = 'sm' }) {
  const nivel = NIVEL_PRIORIDADE[priority] ?? 0;
  const alturas = size === 'lg' ? [6, 10, 14] : [5, 8, 11];

  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'flex-end', gap: 2, flexShrink: 0,
        color: TINTA_PRIORIDADE[priority] ?? T.faint,
      }}
    >
      {alturas.map((altura, i) => (
        <span
          key={altura}
          style={{
            width: 3, height: altura, borderRadius: 1,
            background: 'currentColor',
            // A barra apagada é a mesma tinta rebaixada: sobre o cartão e sobre
            // o cartão escolhido, que são superfícies diferentes, uma cor fixa
            // sumiria numa delas.
            opacity: i < nivel ? 1 : 0.22,
          }}
        />
      ))}
    </span>
  );
}

/** A gravidade dita por inteiro: o medidor e a palavra que ele desenha. */
function Gravidade({ priority, size = 'sm' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <Medidor priority={priority} size={size} />
      <span
        style={{
          color: priority === 'ALTA' ? T.danger : T.mute,
          fontSize: 10, fontWeight: W.strong,
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}
      >
        {labelOf(PRIORITIES, priority)}
      </span>
    </span>
  );
}

/**
 * O fio do prazo, soldado à borda de baixo do cartão.
 *
 * Fora do fluxo (`position: absolute`) porque ele é a borda do cartão, e não
 * mais um item empilhado dentro dele: no fluxo, ele empurraria o rodapé de
 * texto para cima e o cartão ficaria com uma tira de fundo entre os dois.
 */
function BarraDePrazo({ consumo, atrasado }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
        background: T.chip,
      }}
    >
      <span
        style={{
          display: 'block', height: '100%',
          width: `${Math.min(1, consumo) * 100}%`,
          // `mute` e não `faint`: em três pixels de altura o nível mais apagado
          // do produto some contra o trilho, e o fio deixa de ser lido de longe
          // — que é a única coisa que ele existe para ser.
          background: atrasado ? T.danger : T.mute,
          transition: 'width 240ms ease',
        }}
      />
    </span>
  );
}

/**
 * Uma ocorrência na fila.
 *
 * A ordem de leitura é a da decisão: quanto corre (medidor), o que é (o tipo de
 * manutenção), há quanto tempo espera (à direita), o que está acontecendo, e o
 * contexto que diferencia duas parecidas. O andar aparece no rodapé quando a
 * fila está por urgência, e some quando ela está por andar — ali o cabeçalho do
 * grupo já o disse, e repeti-lo em cada cartão é tinta gasta.
 *
 * O realce do cursor e do teclado mora no CSS (`.fila-card`, no globals.css).
 * Em JS ele custaria o realce do teclado inteiro e deixaria o estado grudado
 * depois do toque no telefone — a mesma razão do `.btn`.
 */
function CartaoDaFila({ ticket, ativa, mostrarAndar, onClick, onKeyDown, className = '' }) {
  const { texto, consumo, atrasado } = prazo(ticket);
  const tipo = labelOf(MAINTENANCE_TYPES, ticket.maintenance_type);

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-id={ticket.id}
      aria-current={ativa ? 'true' : undefined}
      aria-label={`${ticket.floor?.label ?? 'Sem andar'} · ${tipo} · prioridade ${labelOf(PRIORITIES, ticket.priority)} · esperando ${texto}`}
      className={`fila-card ${ativa ? 'is-ativa' : ''} ${className}`}
      style={{
        position: 'relative', overflow: 'hidden',
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: ativa ? T.chip : T.card,
        borderRadius: R.card,
        boxShadow: ativa ? undefined : T.cardRing,
        padding: '13px 15px 15px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Gravidade priority={ticket.priority} />

        {/* Números tabulares: sem isso "há 3 dias" e "há 12 dias" desalinham a
            grade inteira, e a varredura perde o eixo. */}
        <span style={{
          color: atrasado ? T.danger : T.faint, fontSize: 12, flexShrink: 0,
          fontWeight: atrasado ? W.strong : W.body,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {texto}
        </span>
      </div>

      <span style={{
        color: T.text, fontSize: 15, fontWeight: W.title, letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {tipo}
      </span>

      {/* `minHeight` de duas linhas: sem ele, a ocorrência descrita em uma linha
          encolhe o cartão e a fileira fica com degraus. */}
      <p className="clamp-2" style={{ color: T.mute, fontSize: 12, lineHeight: 1.55, minHeight: 37 }}>
        {ticket.description}
      </p>

      <p style={{
        color: T.faint, fontSize: 11,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {[mostrarAndar && ticket.floor?.label, labelOf(CATEGORIES, ticket.category), ticket.report?.inspector?.name]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <BarraDePrazo consumo={consumo} atrasado={atrasado} />
    </button>
  );
}

/**
 * O estado da fila, e por qual eixo lê-la.
 *
 * Uma fila de triagem sem número é uma fila de tamanho desconhecido: dá para
 * rolar e descobrir, mas descobrir custa. As frases respondem as três perguntas
 * de quem abre a tela — quanto tem, quanto é urgente, e o que já esperou demais.
 */
function FaixaDaFila({ tickets, eixo, onEixo }) {
  const altas = tickets.filter((t) => t.priority === 'ALTA').length;
  const atrasados = tickets.filter((t) => prazo(t).atrasado).length;

  const partes = [
    `${tickets.length} ${tickets.length === 1 ? 'ocorrência esperando' : 'ocorrências esperando'}`,
    altas > 0 && `${altas} de prioridade alta`,
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

      {/* À direita, longe da contagem: mudar o eixo não muda o que há na fila,
          só a ordem em que ela é lida. */}
      <div role="group" aria-label="Como ordenar a fila" className="seg" style={{ marginLeft: 'auto' }}>
        {[
          { valor: 'URGENCIA', label: 'Por urgência' },
          { valor: 'ANDAR', label: 'Por andar' },
        ].map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => onEixo(opcao.valor)}
            aria-pressed={eixo === opcao.valor}
            className={`seg__btn ${eixo === opcao.valor ? 'is-on' : ''}`}
          >
            {opcao.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Um rótulo de seção da ficha — a micro-caixa-alta das ordens de serviço. */
function Rotulo({ children }) {
  return (
    <p style={{
      color: T.faint, fontSize: 10, fontWeight: W.strong,
      letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>
      {children}
    </p>
  );
}

/** Um par rótulo/valor da ficha. */
function Fato({ label, children }) {
  return (
    <div>
      <p style={{ color: T.mute, fontSize: 12 }}>{label}</p>
      <div style={{ color: T.text, fontSize: 13, marginTop: 3, fontWeight: W.strong }}>{children}</div>
    </div>
  );
}

/**
 * O enquadramento da ocorrência, e quem tria pode corrigi-lo.
 *
 * Quem vistoria enquadra no corredor, com o que vê naquele andar; quem tria
 * enquadra com o prédio inteiro à frente, e é ele que sabe que a mesma
 * infiltração é emergencial neste andar e preventiva no outro. Sem isto,
 * consertar um enquadramento errado exigia refazer a vistoria — e a prioridade
 * é justamente o que ordena esta fila e o que o andar reporta ao final.
 *
 * Grava ao escolher, sem botão de salvar. Triagem é gesto repetido — vinte
 * ocorrências numa sessão —, e um segundo botão aqui competiria pela atenção
 * com o único que esta tela existe para receber, que é "Encaminhar". O valor na
 * tela é o local: sem ele, o droplist voltaria ao antigo até a lista recarregar,
 * e a pessoa veria a escolha desfazer-se sozinha.
 */
function Enquadramento({ ticket }) {
  const update = useUpdateTicket();
  const { show: toast } = useToastStore();
  const [prioridade, setPrioridade] = useState(ticket.priority ?? '');
  const [categoria, setCategoria] = useState(ticket.category ?? '');

  async function gravar(campo, valor, aplicar, anterior) {
    if (valor === anterior) return;
    aplicar(valor);

    try {
      await update.mutateAsync({ id: ticket.id, [campo]: valor });
      toast('Enquadramento atualizado', 'success');
    } catch (e) {
      // De volta ao que estava: a tela não pode continuar mostrando uma
      // classificação que o servidor recusou.
      aplicar(anterior);
      toast(e?.response?.data?.error?.message || 'Erro ao reclassificar', 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Rotulo>Enquadramento</Rotulo>

      {/* Lado a lado, e é o que dita a largura da ficha: empilhados, os dois
          campos empurram a seção para baixo da barra de decisão, e o segundo
          nasce escondido. A coluna é larga o bastante para "Emergencial" caber
          em meia — abaixo disso o droplist esconde o valor escolhido, e um campo
          que esconde o valor não serve para conferir enquadramento. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Select
          label="Prioridade"
          options={PRIORITIES}
          value={prioridade}
          disabled={update.isPending}
          onChange={(e) => gravar('priority', e.target.value, setPrioridade, prioridade)}
        />
        <Select
          label="Categoria"
          options={CATEGORIES}
          value={categoria}
          disabled={update.isPending}
          onChange={(e) => gravar('category', e.target.value, setCategoria, categoria)}
        />
      </div>
    </div>
  );
}

/**
 * A decisão, numa barra que não sai da tela.
 *
 * A ficha é comprida — descrição, vistoria e enquadramento — e a única coisa
 * que esta tela existe para fazer não pode ficar atrás de uma rolagem. A barra
 * fica colada ao pé da ficha, o conteúdo passa por baixo, e o gesto está sempre
 * a um olhar de distância.
 *
 * Encaminhar é o gesto primário e por isso é o botão dourado. Não há um segundo
 * botão ao lado: nesta tela não existe outra coisa a fazer com a ocorrência, e
 * inventar uma opção secundária só faria a pessoa parar para escolher entre uma
 * e nenhuma.
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
        // recuos negativos a fazem encostar nas bordas da ficha, e o `padding`
        // devolve o respiro por dentro. Sem eles sobraria uma tira do fundo da
        // ficha de cada lado, e o conteúdo apareceria rolando por ela.
        //
        // Numa propriedade só: `marginTop` seguido do atalho `margin` seria
        // apagado por ele, e a barra subiria para o meio da ficha vazia.
        margin: 'auto -22px -22px', padding: '16px 22px',
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
 * A ficha da ocorrência aberta: o que aconteceu, como está enquadrado, e a quem
 * mandar — nesta ordem, que é a ordem em que se decide.
 *
 * Sem animação de entrada. Trocar de ocorrência acontece dezenas de vezes numa
 * sessão de triagem, e é o gesto que a seta do teclado repete — animar a troca
 * põe um atraso entre a tecla e a resposta justamente onde a pessoa está mais
 * atenta. O que muda de verdade é o conteúdo, e ele muda de uma vez.
 */
function Ficha({ ticket, buildingId }) {
  const { texto, atrasado } = prazo(ticket);

  const divisor = { borderTop: `1px solid ${T.line}`, paddingTop: 18 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100%' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Gravidade priority={ticket.priority} size="lg" />

          <span aria-hidden="true" style={{ color: T.line }}>|</span>

          <span style={{
            color: atrasado ? T.danger : T.mute, fontSize: 12,
            fontWeight: atrasado ? W.strong : W.body,
            fontVariantNumeric: 'tabular-nums',
          }}>
            Esperando encaminhamento {texto}
          </span>
        </div>

        <h2 style={{ color: T.text, fontSize: 24, fontWeight: W.title, marginTop: 12, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {labelOf(MAINTENANCE_TYPES, ticket.maintenance_type)}
        </h2>
        <p style={{ color: T.mute, fontSize: 13, marginTop: 5 }}>
          {[ticket.floor?.label, ticket.report?.building?.name].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div style={divisor}>
        <Rotulo>O que está acontecendo</Rotulo>
        <p style={{ color: T.text, fontSize: 14, lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-wrap' }}>
          {ticket.description}
        </p>
      </div>

      <div style={divisor}>
        <Rotulo>Da vistoria</Rotulo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 10 }}>
          <Fato label="Relatado em">{dayLabel(ticket.report?.date)}</Fato>
          <Fato label="Vistoriado por">{ticket.report?.inspector?.name ?? '—'}</Fato>
        </div>
      </div>

      <div style={divisor}>
        <Enquadramento ticket={ticket} />
      </div>

      <BarraDeDecisao ticket={ticket} buildingId={buildingId} />
    </div>
  );
}

/** O cabeçalho de um andar, quando a fila está agrupada por ele. */
function CabecalhoDoAndar({ label, tickets }) {
  const atrasados = tickets.filter((t) => prazo(t).atrasado).length;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 1,
      display: 'flex', alignItems: 'center', gap: 10,
      background: T.bg, padding: '2px 0 8px',
    }}>
      <h3 style={{
        color: T.text, fontSize: 11, fontWeight: W.strong,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {label}
      </h3>
      {/* Sem contagem ao lado do nome: quase todo andar tem número no rótulo, e
          "2º ANDAR 2" se lê como se o andar tivesse dois números. Quantas
          ocorrências há no grupo está logo abaixo, em cartões que se contam de
          relance — o que o cabeçalho precisa dizer, e a lista não, é quanto
          daquele andar já apodreceu. */}
      {atrasados > 0 && (
        <span style={{ color: T.danger, fontSize: 11, fontWeight: W.strong }}>
          {atrasados} esperando demais
        </span>
      )}
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: T.line }} />
    </header>
  );
}

/** A grade dos cartões — a mesma medida nos dois eixos de leitura. */
function Grade({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))',
      gap: 12,
      alignItems: 'start',
    }}>
      {children}
    </div>
  );
}

/** O esqueleto da fila enquanto ela chega. */
function Esqueleto() {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 400px)', gap: 20, padding: '0 32px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', gap: 12, alignContent: 'start' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: 138, borderRadius: R.card }} />
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

export function ChamadosBoard({ buildingId }) {
  const { data, isLoading } = useTickets(buildingId, 'NOVOS');
  // A lista vazia é memorizada junto: `data?.tickets ?? []` nasce um array novo
  // a cada render enquanto a consulta não chegou, e um array novo invalidaria as
  // duas memórias abaixo em toda pintura — que é o mesmo que não tê-las.
  const tickets = useMemo(() => data?.tickets ?? [], [data]);

  const [eixo, setEixo] = useState('URGENCIA');

  // A ordem é derivada da lista, e não guardada: encaminhar tira uma ocorrência
  // daqui e reclassificar muda o lugar de outra — um estado próprio teria de ser
  // sincronizado a cada uma dessas coisas, e é assim que ele acaba desalinhado.
  const filaOrdenada = useMemo(() => [...tickets].sort(porUrgencia), [tickets]);
  const grupos = useMemo(
    () => (eixo === 'ANDAR' ? agruparPorAndar(tickets) : []),
    [eixo, tickets]
  );

  // Andar pelo teclado é andar pelo que se vê: com a fila por andar, "próxima"
  // é a próxima na tela, e não a próxima em urgência.
  const naOrdemDaTela = eixo === 'ANDAR' ? grupos.flatMap((g) => g.tickets) : filaOrdenada;

  // A seleção é derivada: quando a lista muda — porque um chamado foi
  // encaminhado e saiu daqui — o escolhido deixa de existir e a tela volta
  // sozinha para o primeiro, sem efeito nenhum sincronizando estado.
  const [escolhido, setEscolhido] = useState(null);
  const aberta = naOrdemDaTela.find((t) => t.id === escolhido) ?? naOrdemDaTela[0] ?? null;
  const gradeRef = useRef(null);

  // Trocar de ocorrência remonta a ficha, e com ela some o responsável já
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
   * No `onKeyDown` de cada cartão, e não numa escuta na janela: a tela do
   * moderador tem barra lateral e campos, e uma escuta global roubaria as setas
   * de quem está dentro de um droplist. Presa ao botão, ela só existe enquanto o
   * foco está numa ocorrência.
   *
   * Cima e esquerda andam para trás, baixo e direita para a frente — e as
   * quatro andam de uma em uma, e não de uma coluna. A grade tem quantas
   * colunas couberem na janela, então "a de baixo" não é um número que o
   * componente conheça; andar na ordem da leitura é o que se pode prometer e
   * cumprir em qualquer largura.
   */
  function navegar(e) {
    const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!passo) return;

    const i = naOrdemDaTela.findIndex((t) => t.id === aberta?.id);
    const proximo = naOrdemDaTela[i + passo];
    if (!proximo) return;

    e.preventDefault();
    trocar(proximo.id);
    // O foco acompanha a seleção: sem isso a próxima seta continuaria saindo do
    // botão antigo, e o leitor de tela seguiria anunciando a ocorrência anterior.
    gradeRef.current?.querySelector(`[data-id="${proximo.id}"]`)?.focus();
  }

  if (isLoading) return <Esqueleto />;
  if (tickets.length === 0) return <FilaVazia />;

  const cartao = (ticket, idx) => (
    <CartaoDaFila
      key={ticket.id}
      ticket={ticket}
      ativa={ticket.id === aberta?.id}
      mostrarAndar={eixo !== 'ANDAR'}
      onClick={() => trocar(ticket.id)}
      onKeyDown={navegar}
      className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
    />
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '0 32px 28px' }}>
      <FaixaDaFila tickets={tickets} eixo={eixo} onEixo={setEixo} />

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 400px)', gap: 20 }}>
        <div
          ref={gradeRef}
          // `group`, e não `listbox`: numa listbox os filhos têm de ser
          // `option`, e `option` não é botão — a fila perderia o Enter e o
          // Espaço que o elemento nativo já dá de graça.
          role="group"
          aria-label="Ocorrências esperando encaminhamento"
          style={{ overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          {eixo === 'ANDAR' ? (
            grupos.map((grupo) => (
              <section key={grupo.id}>
                <CabecalhoDoAndar label={grupo.label} tickets={grupo.tickets} />
                <Grade>{grupo.tickets.map(cartao)}</Grade>
              </section>
            ))
          ) : (
            <Grade>{filaOrdenada.map(cartao)}</Grade>
          )}
        </div>

        <div style={{ overflowY: 'auto', background: T.card, boxShadow: T.cardRing, borderRadius: R.card, padding: 22 }}>
          {/* `key` no chamado: o responsável escolhido nasce vazio a cada
              ocorrência, e trocar de cartão tem de limpá-lo — não carregar para
              a seguinte a escolha feita para a anterior. */}
          {aberta ? (
            <UnsavedScope report={report}>
              <Ficha key={aberta.id} ticket={aberta} buildingId={buildingId} />
            </UnsavedScope>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.mute, fontSize: 14, gap: 8 }}>
              <Inbox size={16} /> Escolha uma ocorrência ao lado
            </div>
          )}
        </div>
      </div>

      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </div>
  );
}
