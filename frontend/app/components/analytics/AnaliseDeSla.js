'use client';
import { AlertTriangle, Clock } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { labelOf, MAINTENANCE_TYPES, PRIORITIES } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM } from '@/app/lib/theme';
import { Colunas } from './Colunas';

/**
 * O prazo: quanto se cumpriu, onde se perdeu, e o que está prestes a estourar.
 *
 * Três colunas, uma por prioridade, com a altura no tempo médio de resolução e
 * a meta atravessada por uma linha tracejada. É o desenho que responde a
 * pergunta do bloco de relance: a coluna que passa da própria linha é a
 * prioridade que não está sendo cumprida, e não é preciso ler número nenhum
 * para ver qual é.
 *
 * A meta entra como linha, e não como segunda coluna ao lado: duas colunas por
 * prioridade viram seis colunas e uma legenda, e a comparação que importa —
 * "passou ou não passou da própria meta" — fica escondida dentro de um par.
 * Cada prioridade tem meta diferente, então a linha muda de altura de coluna
 * para coluna, que é exatamente a informação.
 *
 * A tinta segue a regra do produto: só o que pede socorro é colorido. A coluna
 * que estourou a meta é `danger`, o resto é a tinta neutra do gráfico. Um par
 * verde-e-vermelho gastaria duas cores para dizer o que uma diz, e o verde do
 * tema é claro demais para virar preenchimento sobre o cartão escuro.
 */

/**
 * O tempo médio de resolução.
 *
 * Mora aqui, e não na fileira de indicadores lá em cima, porque a pergunta que
 * ele responde é a deste bloco: "levamos quanto tempo, contra a meta de quanto
 * tempo". Em cima ele era o oitavo cartão de uma fileira de oito, longe das
 * metas com que só ele se compara — e as colunas logo abaixo repetem a mesma
 * grandeza, quebrada por prioridade.
 */
function TempoMedio({ kpis, base }) {
  const dias = kpis?.tempo_medio_dias_uteis;
  const delta = kpis?.variacao?.tempo_medio_dias_uteis;

  // Sem `textAlign: right`: no desktop quem o empurra para a direita é o
  // `space-between` do pai, e no telefone, onde ele desce para a linha de
  // baixo, o texto alinhado à direita ficava solto no meio do nada.
  return (
    <div>
      <span
        style={{
          fontFamily: T.display, fontSize: 26, fontWeight: W.title,
          color: T.text, lineHeight: 1, letterSpacing: '-0.02em',
        }}
      >
        {dias === null || dias === undefined ? '—' : `${dias.toFixed(1).replace('.', ',')} d`}
      </span>
      <p style={{ color: T.mute, fontSize: 11, marginTop: 4 }}>tempo médio de resolução</p>
      {delta !== null && delta !== undefined && (
        <p
          style={{
            color: delta > 0 ? T.danger : T.faint, fontSize: 11,
            fontWeight: delta > 0 ? W.strong : W.body, marginTop: 2, ...NUM,
          }}
        >
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1).replace('.', ',')} d
          <span style={{ color: T.faint, fontWeight: W.body }}> vs. {base}</span>
        </p>
      )}
    </div>
  );
}

/** O termômetro do período: quanto do que fechou saiu no prazo. */
function Cumprimento({ dentro, atrasados }) {
  const total = dentro + atrasados;

  if (total === 0) {
    return (
      <p style={{ color: T.mute, fontSize: 13 }}>
        Nenhum chamado foi concluído neste período, então não há prazo cumprido a medir.
      </p>
    );
  }

  const pct = Math.round((dentro / total) * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* A coluna empilhada ao lado do número: a mesma grandeza nas duas
          linguagens, para quem lê o número e para quem lê a forma. */}
      <div
        aria-hidden="true"
        style={{
          width: 22, height: 58, display: 'flex', flexDirection: 'column', gap: 2,
          flexShrink: 0,
        }}
      >
        {atrasados > 0 && (
          <span
            style={{
              height: `${(atrasados / total) * 100}%`, background: T.danger,
              borderRadius: '4px 4px 0 0',
            }}
          />
        )}
        {dentro > 0 && (
          <span
            style={{
              height: `${(dentro / total) * 100}%`, background: T.mute, opacity: 0.42,
              borderRadius: atrasados > 0 ? '0 0 4px 4px' : '4px',
            }}
          />
        )}
      </div>

      <div>
        <span
          style={{ fontFamily: T.display, fontSize: 30, fontWeight: W.title, color: T.text, ...NUM }}
        >
          {pct}%
        </span>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
          dos {total} concluídos saíram dentro do prazo
        </p>
        {atrasados > 0 && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
              color: T.danger, fontSize: 12, fontWeight: W.strong, ...NUM,
            }}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {atrasados} {atrasados === 1 ? 'fechado atrasado' : 'fechados atrasados'}
          </span>
        )}
      </div>
    </div>
  );
}

/** A fila do que ainda dá para salvar. */
function EmRisco({ itens, onAbrir }) {
  if (itens.length === 0) {
    return (
      <p style={{ color: T.faint, fontSize: 12 }}>
        Nenhum chamado aberto passou de 80% do prazo. Nada a correr atrás hoje.
      </p>
    );
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {itens.map((t) => {
        const restam = t.limite - t.dias;

        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onAbrir?.(t)}
              className="btn"
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                cursor: onAbrir ? 'pointer' : 'default',
                background: T.chip, borderRadius: R.control, padding: '8px 10px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    color: T.text, fontSize: 12, fontWeight: W.title, display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {labelOf(MAINTENANCE_TYPES, t.maintenance_type)}
                </span>
                <span style={{ color: T.faint, fontSize: 11 }}>
                  {[t.floor_label, t.responsible ?? 'sem responsável'].filter(Boolean).join(' · ')}
                </span>
              </span>

              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  color: T.mute, fontSize: 11, fontWeight: W.strong, ...NUM,
                }}
              >
                <Clock size={11} aria-hidden="true" />
                {restam === 0
                  ? 'estoura hoje'
                  : `${restam} ${restam === 1 ? 'dia útil' : 'dias úteis'}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AnaliseDeSla({ sla, kpis, periodo, loading, onAbrirChamado }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton style={{ height: 58 }} />
        <Skeleton style={{ height: 200 }} />
        <Skeleton style={{ height: 44 }} />
      </div>
    );
  }

  const prioridades = sla?.por_prioridade ?? [];

  const colunas = prioridades.map((p) => {
    const media = p.media_dias_uteis;
    const estourou = media !== null && media > p.meta;
    const diff = media === null ? null : Math.abs(media - p.meta).toFixed(1).replace('.', ',');

    return {
      id: p.priority,
      valor: media,
      texto: media === null ? null : `${media.toFixed(1).replace('.', ',')} d`,
      referencia: p.meta,
      rotulo: labelOf(PRIORITIES, p.priority),
      sublinha: `meta ${p.meta} dias úteis`,
      /**
       * O veredito, escrito.
       *
       * "9,8 d" não decide nada — é preciso saber de cabeça que a meta da média
       * é 10 e fazer a conta. "0,2 d dentro da meta" decide. A linha tracejada
       * mostra o mesmo, mas mostrar e dizer não competem: quem varre a tela lê
       * a frase, quem quer o tamanho da folga olha a distância até a linha.
       */
      nota:
        media === null
          ? 'nada concluído no período'
          : `${diff} d ${estourou ? 'acima da meta' : 'dentro da meta'}`,
      alerta: estourou,
      rotuloCompleto: `${labelOf(PRIORITIES, p.priority)} — meta ${p.meta} dias úteis, ${p.fechados} concluídos, ${p.fechados_atrasados} fora do prazo`,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0 }}>
      {/* As duas leituras do prazo lado a lado: quanto cumpriu e quanto demorou.
          São a mesma pergunta por dois ângulos, e separá-las em cartões
          diferentes obrigava a comparar de cabeça. */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap',
        }}
      >
        <Cumprimento dentro={sla?.dentro ?? 0} atrasados={sla?.atrasados ?? 0} />
        <TempoMedio kpis={kpis} base={periodo?.anterior?.toLowerCase() ?? 'o período anterior'} />
      </div>

      <div
        style={{
          borderTop: `1px solid ${T.line}`, paddingTop: 16,
          display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0,
        }}
      >
        <p
          style={{
            color: T.faint, fontSize: 10, fontWeight: W.strong,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}
        >
          Tempo médio de resolução contra a meta
        </p>
        {/* Mínimo maior que o padrão: este cartão carrega mais texto em volta
            (o percentual, o tempo médio, a lista de risco), então sobra menos
            altura para o desenho. Sem o piso mais alto, três colunas de prazo
            ficavam com metade da altura das quatro do funil ao lado. */}
        <Colunas
          itens={colunas}
          alturaMinima={168}
          medida="Tempo médio em dias úteis"
          rotuloReferencia="Meta da prioridade"
          vazio="Nenhum chamado concluído no período, então não há tempo de resolução a comparar."
        />
      </div>

      {/* Prende no pé do cartão, pelo mesmo motivo do funil ao lado. */}
      <div style={{ marginTop: 'auto', borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
        <p
          style={{
            color: T.faint, fontSize: 10, fontWeight: W.strong,
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8,
          }}
        >
          Em risco de estourar
        </p>
        <EmRisco itens={sla?.em_risco ?? []} onAbrir={onAbrirChamado} />
      </div>
    </div>
  );
}
