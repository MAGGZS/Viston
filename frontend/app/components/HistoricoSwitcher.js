'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge, Skeleton } from '@/app/components/ui';
import { OcorrenciaModal, dayLabel } from '@/app/components/OcorrenciaModal';
import { Paginator } from '@/app/components/Paginator';
import { useBuildingOccurrences } from '@/app/hooks/useApi';
import {
  MAINTENANCE_TYPES,
  CATEGORIES,
  PRIORITIES,
  OCCURRENCE_STATUS_LABEL,
  RECORD_STATUS_VARIANT,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { T, R, W } from '@/app/lib/theme';

const PRIORITY_VARIANT = { ALTA: 'danger', MEDIA: 'warning', BAIXA: 'default' };

/**
 * As duas leituras do mesmo histórico.
 *
 * São a mesma pergunta feita de dois jeitos — "o que foi vistoriado" e "o que
 * foi encontrado" —, e por isso dividem o cartão em vez de virar duas telas: a
 * segunda não tem calendário, filtro nem navegação própria, e uma aba a mais
 * cobraria uma escolha antes de a pessoa ver qualquer coisa.
 *
 * Vistorias é a primeira porque é o que existia: quem abre o histórico
 * continua caindo onde sempre caiu.
 *
 * `tab` é o nome curto, o que vai no botão. O `title` continua sendo a frase
 * inteira, que titula o cartão — o botão tem a largura do dedo, não a da frase.
 */
export const HISTORICO_VIEWS = [
  { key: 'VISTORIAS', tab: 'Vistorias', title: 'Histórico de vistorias', eyebrow: 'Vistorias concluídas' },
  { key: 'OCORRENCIAS', tab: 'Ocorrências', title: 'Histórico de ocorrências', eyebrow: 'Ocorrências do prédio' },
];

/**
 * Qual das duas visões está aberta.
 *
 * Mora em quem desenha a tela, e não dentro do alternador, por dois motivos: o
 * título de fora (o eyebrow da barra do topo) acompanha a visão ativa, e os
 * modais de relatório abrem e fecham sem levar a escolha junto.
 */
export function useHistoricoView() {
  // A visão é escolhida pelo nome, e não por um índice que anda: com botão
  // para cada uma, "a próxima" deixou de existir — cada toque diz qual quer.
  const [view, setView] = useState(HISTORICO_VIEWS[0].key);

  const current = HISTORICO_VIEWS.find((v) => v.key === view) ?? HISTORICO_VIEWS[0];
  return {
    view: current.key,
    title: current.title,
    eyebrow: current.eyebrow,
    isVistorias: current.key === 'VISTORIAS',
    select: setView,
  };
}

/**
 * A altura do cabeçalho do alternador.
 *
 * O histórico no computador põe o calendário na coluna ao lado, e ele precisa
 * começar na mesma linha que a lista. Como o cabeçalho é feito de duas peças
 * empilhadas (os botões e o título), a conta sai daqui em vez de ficar como um
 * número solto na tela que o usa.
 */
export const HISTORICO_SWITCHER_HEIGHT = 80;

/** O trilho tem 4px de folga de cada lado; a pílula que corre ocupa o resto. */
const TRACK_PAD = 4;

/**
 * A curva do movimento: sai rápido e chega devagar.
 *
 * É a mesma sensação de uma chave física que se solta e assenta — sem o
 * repique do `anim-pop-in`, que é para coisa que aparece, não para coisa que
 * anda.
 */
const SLIDE = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * O cabeçalho do cartão: os dois botões no canto, o título embaixo.
 *
 * Eram duas setas, uma de cada lado do título, e elas não diziam para onde
 * levavam — com só duas visões, ir para a direita e ir para a esquerda davam no
 * mesmo lugar, e descobrir isso custava um toque. Os botões dizem o nome do que
 * abrem e qual dos dois está aberto agora.
 *
 * São os mesmos das filas de chamados do responsável (ver `SeletorFila`, em
 * responsavel/page.js): pílula sobre trilho, o ativo em dourado. A diferença é
 * que aqui eles não esticam — ficam do tamanho do texto, no canto superior
 * esquerdo, porque o cabeçalho ainda tem o título embaixo.
 *
 * O dourado é uma peça só, que corre de um botão ao outro em vez de acender
 * num e apagar no outro. Acender e apagar são dois eventos que a pessoa tem de
 * juntar; o movimento já diz que é o mesmo lugar que mudou de lado — e diz
 * também de onde ela veio, que é o que a seta antiga nunca conseguiu dizer.
 *
 * Duas decisões que o movimento cobra, e que valem a nota:
 *
 * - As colunas são iguais (`grid-auto-columns: 1fr`), e não do tamanho de cada
 *   palavra. É o que permite a pílula andar por porcentagem, sem medir nada no
 *   DOM — e sem um efeito que remede a cada redimensionamento.
 * - O peso da fonte não muda com a seleção. "Ocorrências" em 600 é mais larga
 *   que em 400: com o peso variando, o trilho inteiro mudava de largura no meio
 *   da viagem, e a pílula chegava tremendo. Quem diz qual está aberta é a cor.
 *
 * Quem tem "reduzir movimento" ligado não vê viagem nenhuma: o globals.css zera
 * a duração de toda transição, e a pílula troca de lugar num quadro.
 */
export function HistoricoSwitcher({ view, onSelect, title, subtitle, action, className = '' }) {
  const index = Math.max(0, HISTORICO_VIEWS.findIndex((item) => item.key === view));

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      {/* Os botões à esquerda e a ação à direita, na mesma linha: o alternador
          é o que se usa toda hora, e ampliar é o que se usa quando o cartão já
          não basta — pôr os dois lado a lado faria disputar o mesmo canto. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div
          role="tablist"
          aria-label="Históricos do prédio"
          style={{
            position: 'relative', maxWidth: '100%',
            display: 'inline-grid', gridAutoFlow: 'column', gridAutoColumns: '1fr',
            background: T.chip, borderRadius: 999, padding: TRACK_PAD,
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
              top: TRACK_PAD, bottom: TRACK_PAD, left: TRACK_PAD,
              width: `calc((100% - ${TRACK_PAD * 2}px) / ${HISTORICO_VIEWS.length})`,
              transform: `translateX(${index * 100}%)`,
              background: T.accent, borderRadius: 999,
              transition: SLIDE,
            }}
          />

          {HISTORICO_VIEWS.map((item) => {
            const active = item.key === view;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(item.key)}
                style={{
                  // `relative` põe o rótulo acima da pílula sem tirá-lo do grid:
                  // é o empilhamento que faz o dourado passar por baixo do texto.
                  position: 'relative',
                  border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 999,
                  padding: '9px 14px', fontFamily: T.display, fontSize: 13, fontWeight: W.title,
                  color: active ? T.onAccent : T.mute,
                  // A cor troca em metade da viagem: a palavra escurece quando o
                  // dourado já está debaixo dela, não antes de ele chegar.
                  transition: 'color 130ms ease 90ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.tab}
              </button>
            );
          })}
        </div>

        {action}
      </div>

      <div style={{ minWidth: 0 }}>
        {/* `key` no título: é o que faz a animação tocar de novo a cada troca —
            sem ele o texto mudaria seco, embaixo de dois botões parados. */}
        <h2
          key={title}
          className="anim-fade-down"
          style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text }}
        >
          {title}
        </h2>
        {subtitle && (
          <p key={subtitle} className="anim-fade-down" style={{ color: T.faint, fontSize: 12, marginTop: 2 }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * As ocorrências do prédio e a que está aberta no modal.
 *
 * As duas formas da lista — cartão e tabela — partilham isto para não
 * divergirem no que é a mesma leitura: mesma consulta, mesmo estado, mesma
 * ordem (do mais recente para o mais antigo, como o repositório devolve).
 *
 * Só leitura: nenhum botão de encaminhar, receber ou fechar mora aqui. Quem
 * trata chamado tem a mesa dele — esta lista é para saber o que já foi
 * encontrado no prédio, e é isso que a torna livre para qualquer vínculo.
 */
function useOcorrencias(buildingId, filters, pageSize) {
  const paged = useBuildingOccurrences(buildingId, 'TODOS', filters, pageSize);
  const [picked, setPicked] = useState(null);

  return {
    ...paged,
    occurrences: paged.rows,
    picked,
    open: setPicked,
    close: () => setPicked(null),
  };
}

const EMPTY_MESSAGE = 'Nenhuma ocorrência neste prédio ainda';
const FILTERED_EMPTY_MESSAGE = 'Nenhuma ocorrência com esses filtros';
const NO_BUILDING_MESSAGE = 'As ocorrências são de um prédio — esta conta não está vinculada a nenhum';

/**
 * Uma ocorrência na lista, com a mesma forma do cartão de vistoria: o que é em
 * cima, o contexto embaixo, as etiquetas no rodapé e a seta dizendo que abre.
 */
function OcorrenciaCard({ occurrence, onOpen, className = '' }) {
  return (
    <div
      onClick={() => onOpen(occurrence)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(occurrence)}
      className={className}
      style={{ background: T.card, borderRadius: R.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.chip; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: T.text, fontWeight: W.title, fontSize: 14 }}>
            {occurrence.floor?.label ?? 'Andar não informado'} ·{' '}
            {labelOf(MAINTENANCE_TYPES, occurrence.maintenance_type)}
          </p>
          <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
            {labelOf(CATEGORIES, occurrence.category)} · {dayLabel(occurrence.report?.date)}
          </p>
        </div>
        <ChevronRight size={18} color={T.faint} style={{ flexShrink: 0 }} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Badge variant={RECORD_STATUS_VARIANT[occurrence.status] ?? 'default'}>
          {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
        </Badge>
        <Badge variant={PRIORITY_VARIANT[occurrence.priority] ?? 'default'}>
          {labelOf(PRIORITIES, occurrence.priority)}
        </Badge>
      </div>
    </div>
  );
}

/** As ocorrências em cartões — a forma da lista de vistorias do histórico. */
export function OcorrenciasList({ buildingId, filters, pageSize }) {
  const { occurrences, isLoading, picked, open, close, ...pager } = useOcorrencias(buildingId, filters, pageSize);

  if (!buildingId) {
    return <p style={{ color: T.faint, fontSize: 14, textAlign: 'center', padding: '60px 0' }}>{NO_BUILDING_MESSAGE}</p>;
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="anim-fade-in" style={{ height: 116, borderRadius: R.card }} />
        ))}
      </div>
    );
  }

  if (occurrences.length === 0) {
    // Como na tabela: quem filtrou precisa saber que foi o filtro, senão
    // procura o problema no prédio.
    const filtrando = Object.values(filters ?? {}).some((v) => v !== '' && v !== undefined && v !== null);

    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="anim-pop-in" style={{ fontSize: 36, marginBottom: 12 }}>🧾</p>
        <p className="anim-fade-up anim-d1" style={{ color: T.faint, fontSize: 14 }}>
          {filtrando ? FILTERED_EMPTY_MESSAGE : EMPTY_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* `key` na página: a lista entra de novo a cada seta, com a mesma
          animação da troca de visão — sem isso, oito linhas trocam de conteúdo
          no lugar e nada diz que a página andou. */}
      <div key={pager.page} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {occurrences.map((o, idx) => (
          <OcorrenciaCard
            key={o.id}
            occurrence={o}
            onOpen={open}
            className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
          />
        ))}
      </div>

      <Paginator
        page={pager.page}
        pages={pager.pages}
        total={pager.total}
        count={occurrences.length}
        pageSize={pager.pageSize}
        onPrev={pager.prev}
        onNext={pager.next}
        isFetching={pager.isFetching}
        style={{ padding: '12px 4px 0' }}
      />

      <OcorrenciaModal open={!!picked} occurrence={picked} onClose={close} />
    </>
  );
}
