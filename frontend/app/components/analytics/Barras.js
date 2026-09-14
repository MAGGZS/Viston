'use client';
import { T, W, NUM, CHART_MARK } from '@/app/lib/theme';
import { TIPO } from './escala';
import { GraficoVazio } from './PoucosDados';

/**
 * O ranking do painel.
 *
 * Barra deitada, e não a coluna de `Colunas`, e a diferença não é de gosto. A
 * coluna é para poucas categorias de nome curto, comparadas por altura, com o
 * rótulo cabendo embaixo: quatro etapas, três prioridades. Aqui são treze tipos
 * de manutenção e vinte andares, e "HIGIENIZACAO_LIMPEZA" não cabe sob uma
 * coluna de 60px — em coluna, o rótulo vira reticência e o gráfico deixa de
 * dizer do que está falando. Deitada, o nome tem a linha inteira, a lista
 * cresce para baixo sem limite, e a ordenação passa a ser a leitura principal.
 *
 * Regras que a peça garante sozinha:
 *
 * - **A escala começa em zero e vai até o maior.** O primeiro item enche a
 *   linha; os outros se leem contra ele. Cortar o eixo aqui faria o segundo
 *   colocado parecer empatado com o primeiro.
 * - **A ordem é a do que chega.** Ordenar aqui dentro esconderia de quem chama
 *   qual é o critério — e "por custo" e "por quantidade" dão listas diferentes.
 * - **Toda barra traz o próprio valor e o próprio `n`.** Um total de R$ 4.200
 *   feito de um chamado e um feito de quarenta são coisas diferentes.
 * - **Existe tabela equivalente**, e nada é dito só por cor.
 *
 * Cor única, `CHART_MARK`: o comprimento já diz o tamanho, e pintar cada barra
 * de um degrau da rampa gastaria o canal da cor com o que a barra mostra
 * sozinha. É a mesma escolha das barras de categoria do painel do moderador.
 */

/** O piso visível de uma barra com valor: sem isto, um valor baixo some. */
const PISO = 2;

/** A altura de cada linha, incluindo o vão. */
const LINHA = 30;

export function Barras({
  itens,
  /** O nome da grandeza, para a tabela e para o leitor de tela. */
  medida = 'Valor',
  /** Clique na linha. Ausente, as linhas não são botões. */
  onSelecionar,
  /** Quantas linhas mostrar antes de cortar. O resto vira uma linha de resumo. */
  limite = 8,
  vazio = 'Sem dados no período.',
}) {
  const temValor = (i) => i.valor !== null && i.valor !== undefined;
  const comValor = itens.filter(temValor);

  if (comValor.length === 0) {
    return <GraficoVazio>{vazio}</GraficoVazio>;
  }

  const teto = Math.max(...comValor.map((i) => i.valor), 1);
  const visiveis = itens.slice(0, limite);
  const restantes = itens.slice(limite).filter(temValor);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
      {visiveis.map((item, i) => {
        const temDado = temValor(item);
        const pct = temDado ? Math.max(PISO, (item.valor / teto) * 100) : 0;
        const cor = item.alerta ? T.danger : item.destaque ? T.accent : CHART_MARK;
        const Linha = onSelecionar ? 'button' : 'div';

        return (
          <Linha
            key={item.id}
            type={onSelecionar ? 'button' : undefined}
            onClick={onSelecionar ? () => onSelecionar(item) : undefined}
            aria-label={
              onSelecionar
                ? `${item.rotuloCompleto ?? item.rotulo}: ${item.texto ?? 'sem medição'}`
                : undefined
            }
            style={{
              display: 'grid',
              /* Nome com largura própria, barra ocupando o resto, valor
                 alinhado à direita. Três colunas, e não o nome dentro da barra:
                 nome sobre barra fica ilegível justamente na barra curta, que é
                 onde o nome é mais necessário. */
              gridTemplateColumns: 'minmax(80px, 34%) 1fr auto',
              alignItems: 'center', gap: 10,
              minHeight: LINHA, padding: '4px 6px', width: '100%',
              background: 'none', border: 'none', borderRadius: 6,
              textAlign: 'left', cursor: onSelecionar ? 'pointer' : 'default',
              transition: 'background 140ms var(--ease-saida)',
            }}
            onMouseEnter={(e) => { if (onSelecionar) e.currentTarget.style.background = T.hover; }}
            onMouseLeave={(e) => { if (onSelecionar) e.currentTarget.style.background = 'transparent'; }}
          >
            <span
              style={{
                color: item.destaque || item.alerta ? T.text : T.mute,
                fontSize: 11, fontWeight: item.destaque ? W.title : W.body,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title={item.rotuloCompleto ?? item.rotulo}
            >
              {item.rotulo}
            </span>

            {/* O trilho existe mesmo sem valor: é ele que mantém as barras
                alinhadas quando uma categoria não teve nada no período. */}
            <span
              aria-hidden="true"
              style={{ position: 'relative', height: 10, width: '100%', color: cor }}
            >
              <span
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: 'currentColor',
                  opacity: item.destaque || item.alerta ? 1 : 0.8,
                  borderRadius: 3,
                  /* Mesma curva e mesma cascata das colunas: a troca de filtro
                     tem de parecer um gesto só, e não cada gráfico por si. */
                  transition: 'width 260ms var(--ease-saida)',
                  transitionDelay: `${i * 30}ms`,
                }}
              />
            </span>

            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  color: temDado ? T.text : T.faint,
                  ...TIPO.meta, fontWeight: W.title, display: 'block', lineHeight: 1.2,
                  ...NUM,
                }}
              >
                {temDado ? item.texto : '—'}
              </span>

              {/* Quantos chamados sustentam o valor. Um total de quatro mil
                  feito de um chamado não é o mesmo total feito de quarenta. */}
              {item.sublinha && (
                <span style={{ color: T.faint, fontSize: 10, display: 'block', lineHeight: 1.3 }}>
                  {item.sublinha}
                </span>
              )}
            </span>
          </Linha>
        );
      })}

      {/* O que ficou de fora vira uma linha, e não some: uma lista cortada em
          oito sem dizer o que sobrou faz o leitor achar que viu o total. */}
      {restantes.length > 0 && (
        <span
          style={{
            color: T.faint, fontSize: 10, padding: '6px 6px 0',
            borderTop: `1px solid ${T.line}`, marginTop: 4,
          }}
        >
          {`mais ${restantes.length} ${restantes.length === 1 ? 'item' : 'itens'} abaixo — a tabela do leitor de tela traz todos`}
        </span>
      )}

      <div className="so-leitor">
        <table>
          <caption>{medida} por item, do maior para o menor</caption>
          <tbody>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">{medida}</th>
              <th scope="col">Leitura</th>
            </tr>
            {itens.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.rotuloCompleto ?? item.rotulo}</th>
                <td>{item.texto ?? 'sem medição'}</td>
                <td>{[item.sublinha, item.nota].filter(Boolean).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
