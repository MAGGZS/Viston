'use client';
import { AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { T, R, W, NUM, CHART, SERIE } from '@/app/lib/theme';
import { Faixa, Figura, PilulaVariacao } from './CartaoMetrica';
import { ESPACO, TIPO } from './escala';

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

export function ResumoDoPeriodo({ kpis, evolucao, periodo, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton style={{ height: 76 }} />
        <Skeleton style={{ height: 52 }} />
      </div>
    );
  }

  /**
   * A série que a forma desenha: os chamados abertos mês a mês.
   *
   * Os meses que ainda não aconteceram ficam de fora — a linha para onde o ano
   * parou, em vez de cair a zero em outubro e desenhar um despencar que é só
   * ausência de dado.
   */
  const serie = (evolucao?.meses ?? []).filter((m) => !m.futuro).map((m) => m.abertos);

  /**
   * A forma só aparece quando há forma.
   *
   * Dois pontos bastam para desenhar uma linha, e não bastam para haver
   * tendência: num prédio com um mês de movimento no ano, a série é uma fileira
   * de zeros com um espinho no meio — e espinho não é tendência, é um mês. Pior,
   * o trecho reto no pé do cartão se lê como borda, não como dado.
   *
   * Dois meses **com movimento** é o piso. É o mesmo julgamento do perfil da
   * manutenção na aba do prédio, pelo mesmo motivo.
   */
  const mesesComMovimento = serie.filter((n) => n > 0).length;

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
        <p style={{ ...TIPO.meta, color: T.mute }}>
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
        {/* Figura, variação e forma — a anatomia de `CartaoMetrica`, na ordem
            que todo bloco do painel segue agora. A variação era texto solto com
            uma seta ao lado do rótulo; virou pílula, que separa a comparação do
            número em vez de colar as duas grandezas na mesma linha. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
          <Figura
            valor={numero(k.total)}
            rotulo={`${k.total === 1 ? 'chamado aberto' : 'chamados abertos'} em ${periodo?.label?.toLowerCase() ?? 'no período'}`}
            variacao={<PilulaVariacao valor={v.total} bomSubir={false} base={base} />}
          />

          {/* A forma do ano atrás do número.
              Não acrescenta dado — os doze meses já estão no bloco de baixo —,
              acrescenta a forma do dado, que é o que o olho lê antes do dígito.
              Só aparece quando há ano a mostrar: num prédio de um mês só, a
              linha seria um traço reto fingindo tendência. */}
          {mesesComMovimento >= 2 && <Faixa valores={serie} cor={SERIE.ambar} altura={40} />}
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

        <PilulaVariacao valor={v.atrasados} bomSubir={false} base={base} />
      </div>
    </div>
  );
}
