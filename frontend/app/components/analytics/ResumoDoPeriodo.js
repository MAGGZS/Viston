'use client';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { T, R, W, NUM, CHART } from '@/app/lib/theme';

/**
 * O que aconteceu no período, numa peça só.
 *
 * Antes eram oito cartões iguais numa fileira. Oito cartões do mesmo tamanho
 * dizem que os oito números importam igual, e o resultado é que nenhum importa:
 * o olho varre a fileira inteira sem achar por onde começar. Pior, oito não
 * divide bem nenhuma largura — a fileira quebrava com sete em cima e um
 * sozinho embaixo, e o cartão órfão era justamente o do SLA.
 *
 * Aqui há uma hierarquia, e ela é a da pergunta: **quanto entrou** (o número
 * grande), **onde isso está** (a barra de composição) e **o que deu errado** (o
 * aviso de atraso, embaixo, com a única cor da peça).
 *
 * A composição é barra empilhada, e não quatro colunas. A pergunta que ela
 * responde é parte-do-todo — "dos 48, quantos já fecharam" —, e parte-do-todo
 * se lê num comprimento dividido, não em quatro alturas que o olho precisa
 * somar. As colunas ficam para os dois blocos que comparam grandezas soltas.
 *
 * A tinta é a rampa `CHART`: uma matiz, quatro degraus, na ordem do caminho do
 * chamado. É a mesma escolha da pizza do painel inicial, pelo mesmo motivo que
 * está escrito lá — estado de chamado é etapa, e etapa se lê melhor numa escala
 * do que em quatro cores diferentes.
 */

/** Os quatro estados agregados, na ordem em que o chamado os atravessa. */
const ESTADOS = [
  { chave: 'abertos', label: 'Aberto' },
  { chave: 'encaminhados', label: 'Encaminhado' },
  { chave: 'em_andamento', label: 'Em andamento' },
  { chave: 'concluidos', label: 'Concluído' },
];

function numero(v, casas = 0) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * A variação contra o período anterior.
 *
 * `bomSubir` é o que impede a peça de mentir: sem ele, o aumento de atrasados
 * ganharia a mesma seta discreta do aumento de concluídos. Só o que piorou
 * recebe cor — colorir os dois lados gastaria a tinta de alarme na metade boa.
 */
function Variacao({ valor, bomSubir, sufixo = '%', casas = 0, base }) {
  if (valor === null || valor === undefined) {
    return <span style={{ color: T.faint, fontSize: 11 }}>sem base de comparação</span>;
  }

  const parado = Math.abs(valor) < 0.05;
  const piorou = !parado && valor > 0 !== bomSubir;
  const seta = parado ? '' : valor > 0 ? '▲' : '▼';

  return (
    <span style={{ color: piorou ? T.danger : T.faint, fontSize: 11, fontWeight: piorou ? W.strong : W.body }}>
      {parado ? 'estável' : `${seta} ${numero(Math.abs(valor), casas)}${sufixo}`}
      <span style={{ color: T.faint, fontWeight: W.body }}> vs. {base}</span>
    </span>
  );
}

/** A composição do período: um comprimento dividido, com os nomes embaixo. */
function Composicao({ kpis }) {
  const fatias = ESTADOS.map((e, i) => ({ ...e, valor: kpis[e.chave] ?? 0, cor: CHART[i] })).filter(
    (f) => f.valor > 0
  );

  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 2px de vão entre as fatias: encostadas, duas tintas vizinhas da mesma
          rampa viram uma só, e a divisão some justamente onde ela é o dado. */}
      <div
        role="img"
        aria-label={`Situação dos ${total} chamados: ${fatias.map((f) => `${f.valor} ${f.label.toLowerCase()}`).join(', ')}`}
        // 18px, e não 14: os degraus da rampa são vizinhos de propósito — é o
        // que os faz ler como ordem —, e numa faixa fina demais eles viram uma
        // tinta só. A altura é o que devolve a diferença entre eles.
        style={{ display: 'flex', height: 18, gap: 2 }}
      >
        {fatias.map((f, i) => (
          <span
            key={f.chave}
            style={{
              width: `${(f.valor / total) * 100}%`,
              background: f.cor,
              borderRadius: `${i === 0 ? 4 : 0}px ${i === fatias.length - 1 ? 4 : 0}px ${i === fatias.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
            }}
          />
        ))}
      </div>

      {/* Rótulo direto em cada estado: são quatro, e uma caixa de legenda ao
          lado obrigaria a ir e voltar entre a cor e o nome. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
          gap: '8px 12px',
        }}
      >
        {ESTADOS.map((e, i) => {
          const valor = kpis[e.chave] ?? 0;

          return (
            <div key={e.chave} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 8, height: 8, borderRadius: 2, background: CHART[i],
                  flexShrink: 0, opacity: valor > 0 ? 1 : 0.3, alignSelf: 'center',
                }}
              />
              <span
                style={{ color: valor > 0 ? T.text : T.faint, fontSize: 14, fontWeight: W.title, ...NUM }}
              >
                {numero(valor)}
              </span>
              <span
                style={{
                  color: T.faint, fontSize: 11, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {e.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResumoDoPeriodo({ kpis, periodo, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton style={{ height: 76 }} />
        <Skeleton style={{ height: 52 }} />
      </div>
    );
  }

  const k = kpis ?? {};
  const v = k.variacao ?? {};
  const base = periodo?.anterior?.toLowerCase() ?? 'o período anterior';
  const pctAtrasado = k.total > 0 ? Math.round((k.atrasados / k.total) * 100) : null;

  if (!k.total) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
          Nenhum chamado foi aberto em {periodo?.label ?? 'no período'}.
        </p>
        <p style={{ color: T.mute, fontSize: 12 }}>
          Os blocos abaixo continuam mostrando o que está parado hoje e o que fechou neste período.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          // O número grande se mede pelo que ocupa; a composição fica com o
          // resto. Abaixo de 640px vira uma coluna e o número vai para cima.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: 20, alignItems: 'center',
        }}
      >
        <div>
          {/* Figuras proporcionais, e não tabulares: `tabular-nums` dá a todo
              dígito a largura do zero, e num corpo de 48 isso abre buracos
              dentro do próprio número. Tabular fica para as colunas que
              precisam alinhar entre linhas. */}
          <span
            style={{
              fontFamily: T.display, fontSize: 48, fontWeight: W.title,
              color: T.text, lineHeight: 1, letterSpacing: '-0.03em',
            }}
          >
            {numero(k.total)}
          </span>
          <p style={{ color: T.mute, fontSize: 13, marginTop: 6 }}>
            {k.total === 1 ? 'chamado aberto' : 'chamados abertos'} em{' '}
            {periodo?.label?.toLowerCase() ?? 'no período'}
          </p>
          <div style={{ marginTop: 4 }}>
            <Variacao valor={v.total} bomSubir={false} base={base} />
          </div>
        </div>

        <Composicao kpis={k} />
      </div>

      {/* O atraso corta os quatro estados — um chamado atrasado pode estar em
          qualquer um deles —, então ele não cabe dentro da barra. Fica embaixo,
          com a única cor de alarme da peça, e com ícone e palavra para não
          depender dela. */}
      <div
        style={{
          borderTop: `1px solid ${T.line}`, paddingTop: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}
      >
        {/* A proporção vive dentro da mesma frase, e não como peça vizinha.
            Como irmã num flex, no telefone ela se descolava e a linha virava
            "5 passaram do / prazo   · 10% do / período" — duas colunas de texto
            partido. Dentro do parágrafo, quebra como frase. */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'flex-start', gap: 7,
            color: k.atrasados > 0 ? T.danger : T.mute, fontSize: 13,
            fontWeight: k.atrasados > 0 ? W.strong : W.body,
          }}
        >
          {k.atrasados > 0 ? (
            <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 8, height: 8, borderRadius: R.badge, background: T.mute,
                opacity: 0.5, flexShrink: 0, marginTop: 6,
              }}
            />
          )}
          <span style={NUM}>
            {k.atrasados === 0
              ? 'Nenhum passou do prazo'
              : `${k.atrasados} ${k.atrasados === 1 ? 'passou' : 'passaram'} do prazo`}
            {pctAtrasado !== null && k.atrasados > 0 && (
              <span style={{ color: T.faint, fontWeight: W.body }}>
                {' '}
                · {pctAtrasado}% do período
              </span>
            )}
          </span>
        </span>

        <Variacao valor={v.atrasados} bomSubir={false} base={base} />
      </div>
    </div>
  );
}
