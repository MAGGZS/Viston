'use client';
import { useState } from 'react';
import { T, W, NUM } from '@/app/lib/theme';
import { GraficoVazio } from './PoucosDados';

/**
 * A série no tempo do painel.
 *
 * `Colunas` compara categorias: quatro etapas, três prioridades, coisas que não
 * têm ordem natural entre si além da que damos a elas. Esta peça responde outra
 * pergunta — para onde isto está indo —, e é a única forma de desenho em que a
 * inclinação quer dizer alguma coisa. Uma coluna por mês mostra doze valores
 * soltos; a linha mostra a direção, que é o que se lê num painel de fila.
 *
 * Ela nasceu para a fila acumulada. O saldo mensal — nasceram menos fecharam —
 * oscila em torno do zero, e a barra de um mês bom é igual à de um mês ruim: a
 * história inteira está na soma corrida, e a soma corrida é uma linha.
 *
 * Regras que a peça garante sozinha:
 *
 * - **O zero está sempre na escala.** Uma série que corta o eixo faz dois
 *   virarem o dobro de um e some com a diferença entre subir e cair.
 * - **O futuro não é desenhado.** Mês que ainda não aconteceu tem valor
 *   herdado, não valor medido, e a linha reta até dezembro leria como previsão.
 * - **O ponto é alvo, não enfeite.** Quando há `onSelecionar`, cada ponto é um
 *   botão com área de toque de verdade, e é por ele que se troca o recorte.
 * - **Existe tabela equivalente**, e nada é dito só por cor.
 *
 * O desenho é SVG com `preserveAspectRatio="none"`: a geometria estica para a
 * largura do cartão sem nenhum `ResizeObserver`, e `vector-effect` segura a
 * espessura do traço, que senão esticaria junto. Texto nenhum entra no SVG
 * justamente por isso — rótulo esticado fica torto. Os rótulos são HTML
 * embaixo, como em `Colunas`.
 */

/** O mínimo que o desenho ocupa antes de crescer com o cartão. */
const ALTURA_MINIMA = 120;

/** O teto, pelo mesmo motivo de `Colunas`: dois cartões lado a lado. */
const ALTURA_MAXIMA = 220;

/** O raio do ponto, em pixels. */
const PONTO = 7;

/** O ponto em destaque cresce, e é assim que ele se anuncia sem mudar de cor. */
const PONTO_DESTAQUE = 11;

export function Linha({
  pontos,
  /** O nome da grandeza, para a tabela e para o leitor de tela. */
  medida = 'Valor',
  /** Desenha o preenchimento sob a linha. Bom para volume, ruim para saldo. */
  area = true,
  /** Clique no ponto. Ausente, os pontos não são botões. */
  onSelecionar,
  /**
   * Desenha os rótulos do eixo. `false` quando a série está empilhada sobre
   * outro gráfico do mesmo eixo — dois conjuntos de "jan fev mar" um sob o
   * outro dizem que são dois eixos, e eles são um só.
   */
  rotulos = true,
  alturaMinima = ALTURA_MINIMA,
  alturaMaxima = ALTURA_MAXIMA,
  vazio = 'Sem dados no período.',
}) {
  const [sobre, setSobre] = useState(null);

  const medidos = pontos.filter((p) => !p.futuro && p.valor !== null && p.valor !== undefined);

  if (medidos.length === 0) {
    return <GraficoVazio>{vazio}</GraficoVazio>;
  }

  /**
   * A escala, com o zero dentro.
   *
   * `span` nunca é zero: uma série inteira no mesmo valor — que acontece, e é
   * uma informação — desenharia uma divisão por zero e sumiria da tela.
   */
  const valores = medidos.map((p) => p.valor);
  const piso = Math.min(0, ...valores);
  const teto = Math.max(0, ...valores);
  const span = teto - piso || 1;

  /** Onde o valor cai, em percentual da altura, contado de baixo. */
  const alturaDe = (valor) => ((valor - piso) / span) * 100;

  /** Onde o ponto cai, em percentual da largura. Um ponto só fica no meio. */
  const larguraDe = (i) => (pontos.length === 1 ? 50 : (i / (pontos.length - 1)) * 100);

  // O traçado só passa pelos medidos, mas nas posições que eles ocupam na série
  // inteira — senão os oito meses de um ano em curso se espalhariam pelos doze.
  const vertices = pontos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.futuro && p.valor !== null && p.valor !== undefined)
    .map(({ p, i }) => `${larguraDe(i)},${100 - alturaDe(p.valor)}`);

  const traco = `M ${vertices.join(' L ')}`;
  const baseDoZero = 100 - alturaDe(0);
  const primeiroX = vertices[0].split(',')[0];
  const ultimoX = vertices[vertices.length - 1].split(',')[0];

  // O preenchimento fecha no zero, e não no pé do cartão: com saldo negativo, o
  // pé do cartão não é a linha de base, e a área ficaria do lado errado.
  const preenchimento = `${traco} L ${ultimoX},${baseDoZero} L ${primeiroX},${baseDoZero} Z`;

  const ativo = sobre ?? pontos.findIndex((p) => p.destaque);
  const emFoco = ativo >= 0 ? pontos[ativo] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* O valor em foco por cima do desenho, e não um por ponto: doze rótulos
          empilhados numa faixa de 200px é ruído, e o mês que interessa é o que
          está sob o cursor ou o que o filtro escolheu. A linha existe sempre,
          mesmo vazia, para o desenho não pular de altura ao entrar o foco. */}
      <span
        style={{
          color: emFoco ? T.text : 'transparent',
          fontSize: 13, fontWeight: W.title, lineHeight: 1.2,
          minHeight: 16, flexShrink: 0, ...NUM,
        }}
      >
        {emFoco ? `${emFoco.rotuloCompleto ?? emFoco.rotulo} · ${emFoco.texto ?? '—'}` : '·'}
      </span>

      <div
        style={{
          position: 'relative', width: '100%',
          flex: 1, minHeight: alturaMinima, maxHeight: alturaMaxima,
          // `accentInk`, e não `accent`: daqui sai o `currentColor` da linha e dos
          // pontos, e dourado puro sobre o cartão branco dá 1,63:1 — a série
          // sumia no tema claro. No escuro as duas variáveis são a mesma cor.
          color: T.accentInk,
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        >
          {area && <path d={preenchimento} fill="currentColor" opacity={0.14} />}
          <path
            d={traco}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            /* Sem isto a espessura estica junto com a geometria, e o traço fica
               grosso no cartão largo e fino no estreito. */
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* A linha de zero, quando o zero não é o pé do desenho. É ela que
            separa "a fila cresceu" de "a fila encolheu". */}
        {piso < 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, right: 0, bottom: `${alturaDe(0)}%`,
              height: 1, background: T.line,
            }}
          />
        )}

        {pontos.map((ponto, i) => {
          const temDado = !ponto.futuro && ponto.valor !== null && ponto.valor !== undefined;
          if (!temDado) return null;

          const destacado = ativo === i;
          const tamanho = destacado ? PONTO_DESTAQUE : PONTO;
          const cor = ponto.alerta ? T.danger : T.accent;
          const Marca = onSelecionar ? 'button' : 'span';

          return (
            <Marca
              key={ponto.id}
              type={onSelecionar ? 'button' : undefined}
              onClick={onSelecionar ? () => onSelecionar(ponto) : undefined}
              onMouseEnter={() => setSobre(i)}
              onMouseLeave={() => setSobre(null)}
              onFocus={() => setSobre(i)}
              onBlur={() => setSobre(null)}
              aria-label={
                onSelecionar
                  ? `${ponto.rotuloCompleto ?? ponto.rotulo}: ${ponto.texto ?? 'sem medição'}`
                  : undefined
              }
              style={{
                position: 'absolute',
                left: `${larguraDe(i)}%`,
                bottom: `${alturaDe(ponto.valor)}%`,
                /* Alvo de toque de 28px sob um ponto de 7: o dedo não acerta
                   sete pixels, e aumentar o ponto para acertar mudaria o
                   desenho. O `transform` centra o alvo no vértice. */
                width: 28, height: 28, transform: 'translate(-50%, 50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', padding: 0,
                cursor: onSelecionar ? 'pointer' : 'default',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: tamanho, height: tamanho, borderRadius: '50%',
                  background: cor,
                  /* O anel da cor do cartão recorta o ponto da linha que passa
                     por baixo dele — sem ele, ponto e traço viram um borrão. */
                  boxShadow: `0 0 0 2px ${T.card}`,
                  transition: 'width 160ms var(--ease-saida), height 160ms var(--ease-saida)',
                }}
              />
            </Marca>
          );
        })}
      </div>

      <span aria-hidden="true" style={{ width: '100%', height: 1, background: T.line, flexShrink: 0 }} />

      {/* Os rótulos em HTML, fora do SVG: dentro dele o
          `preserveAspectRatio="none"` os esticaria junto com a geometria. */}
      {rotulos && (
        <div style={{ display: 'flex' }}>
          {pontos.map((ponto, i) => (
            <span
              key={ponto.id}
              style={{
                flex: 1, minWidth: 0, textAlign: 'center',
                color: ativo === i ? T.text : ponto.futuro ? T.faint : T.mute,
                fontSize: 10, fontWeight: ativo === i ? W.title : W.body,
                opacity: ponto.futuro ? 0.5 : 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title={ponto.rotuloCompleto ?? ponto.rotulo}
            >
              {ponto.rotulo}
            </span>
          ))}
        </div>
      )}

      {/* A mesma série, em linhas, para quem ouve a tela. Dentro de uma `div`
          pelo mesmo motivo de `Colunas`: `.so-leitor` não segura caixa de
          tabela, e a tabela invisível empurrava a página de lado no telefone. */}
      <div className="so-leitor">
        <table>
          <caption>{medida} ao longo do período</caption>
          <tbody>
            <tr>
              <th scope="col">Ponto</th>
              <th scope="col">{medida}</th>
              <th scope="col">Leitura</th>
            </tr>
            {pontos.map((ponto) => (
              <tr key={ponto.id}>
                <th scope="row">{ponto.rotuloCompleto ?? ponto.rotulo}</th>
                <td>{ponto.futuro ? 'ainda não aconteceu' : ponto.texto ?? 'sem medição'}</td>
                <td>{ponto.nota ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
