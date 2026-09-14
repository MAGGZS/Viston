'use client';
import { T, W, NUM } from '@/app/lib/theme';

/**
 * O gráfico de colunas do painel.
 *
 * Coluna, e não barra deitada: a altura é a leitura mais direta que existe para
 * grandeza — o olho compara topos alinhados sem precisar seguir o comprimento
 * de cada régua até a ponta.
 *
 * Uma peça só para os blocos todos. Duas cópias de um gráfico começam iguais e
 * terminam com escalas diferentes na mesma tela, que é o defeito que um painel
 * não pode ter.
 *
 * Cada coluna carrega quatro linhas, sempre na mesma ordem — valor, desenho,
 * nome, e o que aquilo quer dizer. A última é o que separa um gráfico que
 * informa de um que só decora: "9,8 d" não decide nada; "0,2 d abaixo da meta"
 * decide.
 *
 * Regras que a peça garante sozinha:
 *
 * - **A escala começa em zero e inclui a referência** de quem tem valor. Cortar
 *   o eixo faz 5% parecer o dobro; deixar a meta fora da escala esconde o
 *   estouro. E a meta de uma categoria vazia não entra: ela não tem nada a
 *   comparar, e esticaria a escala achatando quem tem.
 * - **O desenho ocupa a altura que sobrar.** Altura fixa dentro de um cartão
 *   esticado deixa um vão morto no pé, que foi o que houve.
 * - **Toda coluna traz o próprio valor.** São poucas; legenda seria uma caixa a
 *   mais para dizer o que já está escrito em cima.
 * - **Existe tabela equivalente**, e nada é dito só por cor.
 */

/** O mínimo que o desenho ocupa antes de crescer com o cartão. */
const ALTURA_MINIMA = 120;

/**
 * O teto do desenho.
 *
 * Dois cartões lado a lado têm alturas iguais mas quantidades diferentes de
 * texto em volta, então o que sobra para o gráfico é diferente em cada um. Sem
 * teto, o cartão de menos texto dava um gráfico de 279px ao lado de um de 120,
 * e os dois pareciam ter pesos diferentes na tela. O teto aproxima os dois sem
 * fixar altura — fixar traria de volta o vão morto que o `flex` resolveu.
 */
const ALTURA_MAXIMA = 240;

/** O piso visível de uma coluna com valor: sem isto, um valor baixo some. */
const PISO = 3;

/**
 * O canto do topo da coluna: 4px, e não o `R.badge` do produto.
 *
 * `R.badge` é 999 — o canto das pílulas —, e numa coluna estreita ele arredonda
 * o topo inteiro numa cúpula. O topo da coluna é o dado: é ele que se compara
 * com o da coluna ao lado, e a cúpula tira a linha reta que torna a comparação
 * possível. Base quadrada, colada na linha de zero.
 */
const CANTO = '4px 4px 0 0';

/**
 * A tinta de uma coluna comum.
 *
 * Cinza, e não o dourado da rampa `CHART`. O painel tem um destaque por tela —
 * o gargalo —, e ele é dourado; se toda coluna já é dourada, o destaque não
 * destaca nada. Mesma divisão do fio de prazo do cartão de chamado: neutro
 * enquanto não há notícia, cor quando há.
 */
const NEUTRO = 0.42;

export function Colunas({
  itens,
  /** O mínimo do desenho. Acima disso ele cresce com o cartão, até o teto. */
  alturaMinima = ALTURA_MINIMA,
  alturaMaxima = ALTURA_MAXIMA,
  /** O nome da grandeza, para a tabela e para o leitor de tela. */
  medida = 'Valor',
  /** O que a linha tracejada significa, quando algum item traz referência. */
  rotuloReferencia = 'Meta',
  vazio = 'Sem dados no período.',
}) {
  const temValor = (i) => i.valor !== null && i.valor !== undefined;
  const referenciaDe = (i) =>
    temValor(i) && i.referencia !== null && i.referencia !== undefined ? i.referencia : null;

  if (!itens.some(temValor)) {
    return <p style={{ color: T.faint, fontSize: 12 }}>{vazio}</p>;
  }

  const teto = Math.max(...itens.map((i) => Math.max(i.valor ?? 0, referenciaDe(i) ?? 0)), 1);
  const temReferencia = itens.some((i) => referenciaDe(i) !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* Desenho e rótulos em duas fileiras, e não numa coluna só por item.
          Juntos, o piso de altura valia para o conjunto: no telefone o rótulo
          cresce para três linhas, come o piso inteiro e sobra uma barra de
          20px. Separados, o piso vale só para o desenho — que é o que ele
          existe para proteger — e o rótulo ocupa o que precisar embaixo. As
          duas fileiras usam o mesmo `flex: 1` e o mesmo vão, então as colunas
          continuam alinhadas. */}
      <div
        style={{
          display: 'flex', alignItems: 'stretch', gap: 6,
          flex: 1, minHeight: alturaMinima, maxHeight: alturaMaxima,
        }}
      >
        {itens.map((item, i) => {
          const temDado = temValor(item);
          const referencia = referenciaDe(item);
          const pct = temDado ? Math.max(PISO, (item.valor / teto) * 100) : 0;
          const marcada = item.destaque || item.alerta;
          const cor = item.destaque ? T.accent : item.alerta ? T.danger : T.mute;

          return (
            <div
              key={item.id}
              style={{
                flex: 1, minWidth: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              {/* O valor em cima da coluna, sempre: são poucas colunas, e o
                  número acima do topo é o que dispensa o eixo vertical. */}
              <span
                style={{
                  color: temDado ? T.text : T.faint,
                  fontSize: 13, fontWeight: temDado ? W.title : W.body,
                  textAlign: 'center', lineHeight: 1.2, ...NUM,
                }}
              >
                {temDado ? item.texto : '—'}
              </span>

              {/* `flex: 1` no trilho: é o que faz o desenho comer a altura que
                  sobra quando o cartão é esticado para casar com o vizinho, em
                  vez de deixar o vão no pé. Teto de largura porque, com quatro
                  itens num cartão largo, `flex: 1` sozinho dá colunas de 200px —
                  que se leem como blocos de cor, não como colunas. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'relative', width: '100%', maxWidth: 72,
                  flex: 1, minHeight: 0, color: cor,
                }}
              >
                <span
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    height: `${pct}%`,
                    background: 'currentColor',
                    opacity: marcada ? 1 : NEUTRO,
                    borderRadius: CANTO,
                    /**
                     * A coluna cresce com curva de saída, e em cascata.
                     *
                     * `ease` saía devagar do lugar — e o primeiro quadro é
                     * justamente o que se está olhando quando se troca o mês.
                     * A curva forte arranca e freia no fim, que é o que faz a
                     * troca de período parecer instantânea mesmo levando o
                     * mesmo tempo.
                     *
                     * `height`, e não `transform: scaleY()`, apesar de este
                     * último rodar na GPU: escalar a barra escala o canto de
                     * 4px junto, e a coluna baixa fica com o topo achatado o
                     * tempo todo. São no máximo doze barras animando uma vez
                     * por troca de filtro — o quadro perdido é hipotético, o
                     * canto torto seria permanente.
                     */
                    transition: 'height 260ms var(--ease-saida)',
                    transitionDelay: `${i * 40}ms`,
                  }}
                />

                {/* A meta é desenhada DEPOIS da barra.

                    A ordem não é detalhe: quando a coluna passa da meta — o
                    único momento em que essa linha decide alguma coisa — a
                    barra a cobriria inteira, e o gráfico esconderia justamente
                    o estouro. Tracejada para não se confundir com o topo de uma
                    coluna vizinha. */}
                {referencia !== null && (
                  <span
                    style={{
                      position: 'absolute', left: -2, right: -2,
                      bottom: `${(referencia / teto) * 100}%`,
                      borderTop: `1px dashed ${T.text}`, opacity: 0.8,
                    }}
                  />
                )}
              </div>

              {/* A linha de zero, por coluna: desenhada aqui, ela acompanha a
                  largura de cada uma e fica óbvio de onde a barra sai. */}
              <span
                aria-hidden="true"
                style={{ width: '100%', height: 1, background: T.line, flexShrink: 0 }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {itens.map((item) => {
          const marcada = item.destaque || item.alerta;

          return (
            <div
              key={item.id}
              style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}
            >
              {/* O rótulo é mais largo que a coluna e avança meio vão para cada
                  lado: no telefone a célula tem 64px, e o vão entre colunas é
                  respiro, não território de ninguém. */}
              <div style={{ width: 'calc(100% + 6px)', margin: '0 -3px', textAlign: 'center' }}>
                <span
                  style={{
                    color: marcada ? T.text : T.mute,
                    fontSize: 11, fontWeight: item.destaque ? W.title : W.body,
                    display: 'block', lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={item.rotuloCompleto ?? item.rotulo}
                >
                  {item.rotulo}
                </span>

                {item.sublinha && (
                  <span style={{ color: T.faint, fontSize: 10, display: 'block', lineHeight: 1.4 }}>
                    {item.sublinha}
                  </span>
                )}

                {/* O que o número quer dizer. É a linha que transforma "9,8 d"
                    em decisão, e por isso ela é a única que ganha cor quando há
                    má notícia. */}
                {item.nota && (
                  <span
                    style={{
                      color: item.alerta ? T.danger : item.destaque ? T.accentInk : T.faint,
                      fontSize: 10, fontWeight: marcada ? W.strong : W.body,
                      display: 'block', lineHeight: 1.4, marginTop: 2,
                    }}
                  >
                    {item.nota}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {temReferencia && (
        <span style={{ color: T.faint, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 14, borderTop: `1px dashed ${T.text}`, opacity: 0.8 }} />
          {rotuloReferencia}
        </span>
      )}

      {/* O mesmo gráfico, em linhas, para quem ouve a tela.

          Dentro de uma `div`, e não com a classe na `<table>`: `.so-leitor`
          conta com `overflow: hidden` para esconder o que não cabe em 1px, e
          isso não vale para caixa de tabela — a tabela invisível vazava e
          empurrava a página de lado no telefone. */}
      <div className="so-leitor">
      <table>
        <caption>{medida} por coluna</caption>
        <tbody>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">{medida}</th>
            {temReferencia && <th scope="col">{rotuloReferencia}</th>}
            <th scope="col">Leitura</th>
          </tr>
          {itens.map((item) => (
            <tr key={item.id}>
              <th scope="row">{item.rotuloCompleto ?? item.rotulo}</th>
              <td>{item.texto ?? 'sem medição'}</td>
              {temReferencia && <td>{item.referencia ?? '—'}</td>}
              <td>{[item.sublinha, item.nota].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
