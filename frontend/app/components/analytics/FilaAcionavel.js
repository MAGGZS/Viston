'use client';
import { AlertTriangle, Clock, Moon } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { MAINTENANCE_TYPES, PRIORITIES, labelOf } from '@/app/lib/maintenanceOptions';
import { T, W, NUM } from '@/app/lib/theme';
import { BaixarCsv } from './BaixarCsv';
import { ESPACO, TIPO } from './escala';

/**
 * O que pede ação hoje.
 *
 * É o único bloco do painel que não é retrospecto, e por isso ele abre a tela.
 * Todo o resto responde à pergunta de quem para para pensar no mês — quanto
 * entrou, como o ano andou, onde trava. Nenhum deles muda o dia de quem abre o
 * painel, e um painel que não muda o dia de ninguém é aberto uma vez e nunca
 * mais.
 *
 * A lista existia: dez chamados "em risco", enterrados no terceiro bloco da
 * primeira aba, dentro do cartão de SLA. Ela sai de lá e sobe, com duas
 * companhias que faltavam.
 *
 * **Três motivos, porque são três decisões.**
 *
 * - **Atrasado** já estourou. Não há prazo a salvar; há conversa a ter, e o
 *   número já foi para a conta do mês.
 * - **Em risco** consumiu 80% do prazo e ainda dá. É o único dos três em que
 *   agir hoje muda o número de amanhã — e por isso ele é o padrão quando não
 *   há atrasado.
 * - **Parado** pode estar dentro do prazo e mesmo assim esquecido: ninguém o
 *   tocou em cinco dias úteis. É o que some da vista justamente por não estar
 *   gritando, e nenhuma tela do produto o mostrava.
 *
 * A aba aberta é a mais grave que tem conteúdo, e não sempre a primeira: abrir
 * em "atrasados" num prédio sem nenhum atrasado é a tela pedindo um clique para
 * mostrar que está tudo bem.
 *
 * Nenhuma das três recorta por período, e é de propósito — o mesmo argumento de
 * `emRisco` no servidor: um chamado de dois meses atrás prestes a estourar é
 * exatamente o que a tela precisa mostrar hoje, e escondê-lo porque nasceu fora
 * do mês escolhido seria a tela ajudando a perder o prazo. O `Relogio` do bloco
 * diz isso, e é por isso que ele fica na seção "agora".
 */

/**
 * O que o chamado está esperando, em português de quem despacha.
 *
 * Não é o `RECORD_STATUS` do produto, e a diferença é de voz: lá os rótulos são
 * o estado do chamado numa etiqueta ("Em andamento"), aqui é o que falta para
 * ele andar, dito em meia frase que cabe depois de um ponto — "na triagem",
 * "esperando aceite". A lista existe para decidir a quem cobrar.
 */
const ESTADO = {
  ABERTO: 'na triagem',
  ENCAMINHADO: 'esperando aceite',
  EM_ANDAMENTO: 'em execução',
  AGUARDANDO_TERCEIRO: 'com terceiro',
  AGUARDANDO_FECHAMENTO: 'esperando fechamento',
};

/**
 * O nome do tipo de manutenção, do mapa do produto.
 *
 * `labelOf` e `MAINTENANCE_TYPES` são os mesmos que o formulário de vistoria e
 * a tela de chamados usam. Derivar o rótulo do enum aqui — trocar `_` por
 * espaço e capitalizar — dava "Ar e condicionado" e "Higienizacao limpeza", e
 * teria deixado esta tela chamando as coisas por nomes que nenhuma outra usa.
 */
const legivel = (tipo) => labelOf(MAINTENANCE_TYPES, tipo);

/**
 * O que vai para o arquivo.
 *
 * Não é a tela: a tela mostra "12 dias úteis além do prazo de 10" numa frase,
 * e a planilha precisa dos dois números em colunas próprias para ordenar e
 * somar. `id` entra porque quem leva a lista para uma reunião precisa voltar ao
 * chamado depois, e é o único campo que faz isso sem ambiguidade.
 */
const COLUNAS_CSV = [
  { chave: 'motivo', titulo: 'Motivo' },
  { chave: 'maintenance_type', titulo: 'Tipo', valor: (t) => legivel(t.maintenance_type) },
  { chave: 'floor_label', titulo: 'Andar' },
  { chave: 'priority', titulo: 'Prioridade', valor: (t) => labelOf(PRIORITIES, t.priority) },
  { chave: 'status', titulo: 'Situação', valor: (t) => ESTADO[t.status] ?? 'em aberto' },
  { chave: 'responsible', titulo: 'Responsável', valor: (t) => t.responsible ?? 'sem responsável' },
  { chave: 'dias', titulo: 'Dias úteis corridos' },
  { chave: 'limite', titulo: 'Prazo em dias úteis' },
  { chave: 'dias_parado', titulo: 'Dias úteis sem toque' },
  { chave: 'description', titulo: 'Descrição' },
  { chave: 'id', titulo: 'ID do chamado' },
];

export function FilaAcionavel({ fila, loading, onAbrirChamado, motivo, onTrocarMotivo }) {
  if (loading) return <Skeleton style={{ height: 220 }} />;
  if (!fila) return null;

  const LISTAS = [
    {
      key: 'ATRASADOS',
      rotulo: 'Atrasados',
      icone: AlertTriangle,
      itens: fila.atrasados ?? [],
      grave: true,
      vazio: 'Nenhum chamado passou do prazo. É o estado em que se quer estar.',
    },
    {
      key: 'EM_RISCO',
      rotulo: 'Em risco',
      icone: Clock,
      itens: fila.em_risco ?? [],
      grave: false,
      vazio: 'Nada perto de estourar o prazo agora.',
    },
    {
      key: 'PARADOS',
      rotulo: 'Parados',
      icone: Moon,
      itens: fila.parados ?? [],
      grave: false,
      vazio: `Ninguém deixou chamado sem toque por ${fila.sem_movimento_desde_dias} dias úteis.`,
    },
  ];

  // A aba aberta é a mais grave que tem conteúdo. Abrir em "atrasados" num
  // prédio sem atrasado nenhum pede um clique para dizer que está tudo bem.
  const primeiraComItens = LISTAS.find((l) => l.itens.length > 0) ?? LISTAS[1];
  const ativa = LISTAS.find((l) => l.key === motivo) ?? primeiraComItens;

  const total = LISTAS.reduce((s, l) => s + l.itens.length, 0);

  /**
   * Quantos parados já aparecem noutra lista.
   *
   * Um chamado entra numa aba só — quem estourou o prazo não é listado de novo
   * como esquecido, senão a fila de trabalho conta a mesma pessoa duas vezes. O
   * efeito colateral é que o cartão "A fila hoje" pode dizer "2 sem movimento"
   * ao lado de uma aba "Parados 0", e dois números da mesma tela que discordam
   * é o defeito que um painel não pode ter.
   *
   * Então a aba diz onde eles foram parar, em vez de fingir que não existem.
   */
  const paradosEmOutraLista = [...(fila.atrasados ?? []), ...(fila.em_risco ?? [])].filter(
    (t) => (t.dias_parado ?? 0) >= fila.sem_movimento_desde_dias
  ).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.md, flex: 1, minHeight: 0 }}>
      {/* A conclusão antes da lista, como nos outros blocos: quem passa os
          olhos leva a resposta sem abrir aba nenhuma. */}
      <p style={{ ...TIPO.corpo, color: T.mute }}>
        {total === 0 ? (
          <>Nada na fila pede atenção agora — nenhum atrasado, nenhum perto do prazo, nenhum esquecido.</>
        ) : (
          <>
            <span style={{ color: T.text, fontWeight: W.title }}>
              {total} {total === 1 ? 'chamado pede' : 'chamados pedem'} atenção
            </span>{' '}
            agora, no prédio inteiro — fora do recorte de período.
          </>
        )}
      </p>

      {/* As três abas, com a contagem de cada uma. A contagem vai no botão e
          não só na lista: é ela que diz onde olhar antes de clicar.

          O CSV leva as três listas juntas, e não só a aba aberta: quem exporta
          está levando a fila para fora da tela — para uma reunião, para um
          e-mail —, e exportar um terço dela porque era a aba que estava aberta
          no momento do clique é a exportação mentindo por omissão. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: ESPACO.sm, flexWrap: 'wrap',
        }}
      >
      <div role="tablist" aria-label="Motivos da fila" style={{ display: 'flex', gap: ESPACO.xs, flexWrap: 'wrap' }}>
        {LISTAS.map((lista) => {
          const Icone = lista.icone;
          const selecionada = lista.key === ativa.key;
          const vazia = lista.itens.length === 0;
          const acende = lista.grave && !vazia;

          return (
            <button
              key={lista.key}
              type="button"
              role="tab"
              aria-selected={selecionada}
              onClick={() => onTrocarMotivo?.(lista.key)}
              className="btn press"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${selecionada ? T.line : 'transparent'}`,
                background: selecionada ? T.chip : 'transparent',
                color: acende ? T.danger : selecionada ? T.text : T.mute,
                ...TIPO.meta,
                fontWeight: selecionada ? W.title : W.body,
                cursor: 'pointer',
              }}
            >
              <Icone size={12} aria-hidden="true" />
              {lista.rotulo}
              <span style={{ ...NUM, opacity: vazia ? 0.5 : 1 }}>{lista.itens.length}</span>
            </button>
          );
        })}
      </div>

        <BaixarCsv
          nome="chamados-que-pedem-atencao"
          colunas={COLUNAS_CSV}
          linhas={LISTAS.flatMap((l) =>
            l.itens.map((t) => ({ ...t, motivo: l.rotulo, situacao: situacao(t, l.key, fila.sem_movimento_desde_dias) }))
          )}
        />
      </div>

      {ativa.itens.length === 0 ? (
        <p style={{ ...TIPO.meta, color: T.faint }}>
          {ativa.key === 'PARADOS' && paradosEmOutraLista > 0
            ? `${paradosEmOutraLista === 1 ? 'O chamado sem toque' : `Os ${paradosEmOutraLista} chamados sem toque`} há ${fila.sem_movimento_desde_dias} dias úteis ou mais já ${paradosEmOutraLista === 1 ? 'está' : 'estão'} nas listas acima — cada um aparece uma vez só.`
            : ativa.vazio}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {ativa.itens.map((t, i) => (
            <Item
              key={t.id}
              ticket={t}
              ordem={i}
              motivo={ativa.key}
              semMovimentoDesde={fila.sem_movimento_desde_dias}
              onAbrir={onAbrirChamado}
            />
          ))}
        </ul>
      )}

      {/* As três listas inteiras para quem ouve a tela: a aba é navegação
          visual, e quem lê por leitor de tela não deve precisar acioná-la para
          saber que existem atrasados. */}
      <div className="so-leitor">
        <table>
          <caption>Chamados que pedem atenção agora</caption>
          <tbody>
            <tr>
              <th scope="col">Motivo</th>
              <th scope="col">Chamado</th>
              <th scope="col">Situação</th>
            </tr>
            {LISTAS.flatMap((lista) =>
              lista.itens.map((t) => (
                <tr key={`${lista.key}-${t.id}`}>
                  <th scope="row">{lista.rotulo}</th>
                  <td>{`${legivel(t.maintenance_type)} · andar ${t.floor_label ?? 'sem andar'}`}</td>
                  <td>{situacao(t, lista.key, fila.sem_movimento_desde_dias)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * O que dizer sobre o chamado, conforme o motivo que o trouxe.
 *
 * Uma frase por motivo, e não o mesmo "X de Y dias" nos três: o número que
 * importa no atrasado é quanto ele passou, no em risco é quanto ainda resta, e
 * no parado é há quanto tempo ninguém encosta nele. Mostrar os três em todos
 * obrigaria o leitor a escolher qual ler.
 */
function situacao(t, motivo, semMovimentoDesde) {
  const dias = (n) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;

  if (motivo === 'ATRASADOS') {
    const alem = t.dias - t.limite;
    return `${dias(alem)} além do prazo de ${t.limite}`;
  }

  if (motivo === 'EM_RISCO') {
    const restam = t.limite - t.dias;
    return restam <= 0 ? 'estoura hoje' : `restam ${dias(restam)} de ${t.limite}`;
  }

  return `sem toque há ${dias(t.dias_parado ?? semMovimentoDesde)}`;
}

function Item({ ticket, ordem, motivo, semMovimentoDesde, onAbrir }) {
  const grave = motivo === 'ATRASADOS';
  const Peca = onAbrir ? 'button' : 'div';

  return (
    <li style={{ borderTop: ordem === 0 ? 'none' : `1px solid ${T.line}` }}>
      <Peca
        type={onAbrir ? 'button' : undefined}
        onClick={onAbrir ? () => onAbrir(ticket) : undefined}
        // A mesma entrada das linhas de tabela do produto: opacidade e o
        // escalonamento de `anim-d1`..`anim-d6`. O item é uma linha dentro de
        // um cartão que já subiu; fazê-lo subir de novo seria o mesmo movimento
        // duas vezes na mesma peça.
        className={`anim-fade-in${ordem > 0 ? ` anim-d${Math.min(ordem, 6)}` : ''}`}
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: ESPACO.md, width: '100%', padding: `${ESPACO.sm}px ${ESPACO.xs}px`,
          background: 'none', border: 'none', borderRadius: 6,
          textAlign: 'left', cursor: onAbrir ? 'pointer' : 'default',
          transition: 'background 140ms var(--ease-saida)',
        }}
        onMouseEnter={(e) => { if (onAbrir) e.currentTarget.style.background = T.hover; }}
        onMouseLeave={(e) => { if (onAbrir) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              ...TIPO.corpo, color: T.text, display: 'block',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={ticket.description}
          >
            {legivel(ticket.maintenance_type)}
            {ticket.floor_label && (
              <span style={{ color: T.mute }}> · andar {ticket.floor_label}</span>
            )}
          </span>

          {/* Quem tem a bola e em que ponto ela está. Sem isso, a lista diz o
              que está errado e não diz com quem falar. */}
          <span style={{ ...TIPO.meta, color: T.faint, display: 'block' }}>
            {labelOf(PRIORITIES, ticket.priority)}
            {' · '}
            {ESTADO[ticket.status] ?? 'em aberto'}
            {' · '}
            {ticket.responsible ?? 'sem responsável'}
          </span>
        </span>

        <span
          style={{
            ...TIPO.meta, ...NUM,
            color: grave ? T.danger : T.mute,
            fontWeight: grave ? W.strong : W.body,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {situacao(ticket, motivo, semMovimentoDesde)}
        </span>
      </Peca>
    </li>
  );
}
