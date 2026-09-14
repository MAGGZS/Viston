'use client';
import { T, W, NUM } from '@/app/lib/theme';

/**
 * A distribuição do tempo de resolução.
 *
 * Existe porque a média mente aqui, e mente sempre na mesma direção. Tempo de
 * ciclo é distribuição torta para a direita: a maioria dos chamados fecha
 * rápido e alguns poucos levam meses, e esses poucos puxam a média para longe
 * de qualquer chamado real. O painel dizia "6,5 dias" num prédio em que metade
 * fechava em 5 e um décimo passava de 15 — e nenhum chamado levava 6,5.
 *
 * Um número não resolve isso, nem dois. O que resolve é ver a forma: onde a
 * massa está, quanto a cauda se estende, e de que lado da meta ela cai.
 *
 * A peça marca p50 e p90 sobre as faixas, e a meta por cima. As três marcas
 * juntas respondem a pergunta que o painel existe para responder: não "quanto
 * demora", mas "para quem o prazo não está sendo cumprido".
 *
 * Faixas vêm prontas de quem chama. Decidir os cortes aqui dentro obrigaria a
 * peça a saber que a grandeza é dia útil, e o mesmo desenho serve a horas de
 * etapa e a reais de custo.
 */

/** O piso visível de uma faixa com chamados: sem isto, uma faixa de 1 some. */
const PISO = 4;

/** O mínimo que o desenho ocupa antes de crescer com o cartão. */
const ALTURA_MINIMA = 110;

const ALTURA_MAXIMA = 190;

export function Distribuicao({
  /** `[{ id, rotulo, rotuloCompleto, n, acima }]` — `acima` pinta de alerta. */
  faixas,
  /** As marcas verticais sobre o desenho: `[{ id, posicao: 0..1, rotulo }]`. */
  marcas = [],
  medida = 'Chamados',
  alturaMinima = ALTURA_MINIMA,
  alturaMaxima = ALTURA_MAXIMA,
  vazio = 'Nada fechou neste recorte.',
}) {
  const total = faixas.reduce((s, f) => s + (f.n ?? 0), 0);

  if (total === 0) {
    return <p style={{ color: T.faint, fontSize: 12 }}>{vazio}</p>;
  }

  const teto = Math.max(...faixas.map((f) => f.n ?? 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* O recuo no topo é onde a contagem da barra mais alta cabe.
          A contagem é desenhada sobre a barra, em posição absoluta a partir do
          topo dela; sem folga, a barra que atinge o teto empurra o próprio
          rótulo para fora da caixa e ele é aparado — e a faixa com mais
          chamados fica sendo a única sem número. */}
      <div
        style={{
          position: 'relative', display: 'flex', alignItems: 'stretch', gap: 2,
          flex: 1, minHeight: alturaMinima, maxHeight: alturaMaxima,
          paddingTop: 16, boxSizing: 'border-box',
        }}
      >
        {faixas.map((faixa, i) => {
          const n = faixa.n ?? 0;
          const pct = n === 0 ? 0 : Math.max(PISO, (n / teto) * 100);

          return (
            <div
              key={faixa.id}
              style={{
                flex: 1, minWidth: 0, position: 'relative',
                display: 'flex', alignItems: 'flex-end',
                color: faixa.acima ? T.danger : T.mute,
              }}
              title={`${faixa.rotuloCompleto ?? faixa.rotulo}: ${n}`}
            >
              <span
                aria-hidden="true"
                style={{
                  width: '100%', height: `${pct}%`,
                  background: 'currentColor',
                  opacity: faixa.acima ? 0.85 : 0.42,
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 260ms var(--ease-saida)',
                  transitionDelay: `${i * 30}ms`,
                }}
              />

              {/* A contagem só aparece onde há o que contar: um "0" sobre cada
                  faixa vazia enche a faixa de zeros e afoga os números que
                  importam. */}
              {n > 0 && (
                <span
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: `calc(${pct}% + 3px)`,
                    textAlign: 'center', color: T.mute, fontSize: 10, ...NUM,
                  }}
                >
                  {n}
                </span>
              )}
            </div>
          );
        })}

        {/* As marcas por cima de tudo: p50, p90 e a meta. Verticais, porque a
            grandeza aqui está no eixo horizontal — o que se lê é onde elas caem
            em relação à massa das faixas, não a que altura.

            Começam abaixo do recuo das contagens: atravessar a faixa dos
            números riscaria os rótulos das barras. */}
        {marcas.map((marca) => (
          <span
            key={marca.id}
            aria-hidden="true"
            style={{
              position: 'absolute', top: 16, bottom: 0,
              left: `${Math.min(100, Math.max(0, marca.posicao * 100))}%`,
              width: 0,
              borderLeft: marca.tracejada ? `1px dashed ${T.text}` : `2px solid ${T.accent}`,
              opacity: marca.tracejada ? 0.8 : 1,
            }}
          />
        ))}
      </div>

      <span aria-hidden="true" style={{ width: '100%', height: 1, background: T.line, flexShrink: 0 }} />

      <div style={{ display: 'flex', gap: 2 }}>
        {faixas.map((faixa) => (
          <span
            key={faixa.id}
            style={{
              flex: 1, minWidth: 0, textAlign: 'center',
              color: faixa.acima ? T.danger : T.faint,
              fontSize: 10, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={faixa.rotuloCompleto ?? faixa.rotulo}
          >
            {faixa.rotulo}
          </span>
        ))}
      </div>

      {/* A legenda das marcas, escrita: a posição de uma linha vertical não se
          adivinha, e cor sozinha não diz qual é a meta e qual é o p90. */}
      {marcas.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {marcas.map((marca) => (
            <span
              key={marca.id}
              style={{
                color: T.faint, fontSize: 10,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 12, height: 0,
                  borderTop: marca.tracejada ? `1px dashed ${T.text}` : `2px solid ${T.accent}`,
                  opacity: marca.tracejada ? 0.8 : 1,
                }}
              />
              {marca.rotulo}
            </span>
          ))}
        </div>
      )}

      <div className="so-leitor">
        <table>
          <caption>{medida} por faixa de tempo</caption>
          <tbody>
            <tr>
              <th scope="col">Faixa</th>
              <th scope="col">{medida}</th>
            </tr>
            {faixas.map((faixa) => (
              <tr key={faixa.id}>
                <th scope="row">{faixa.rotuloCompleto ?? faixa.rotulo}</th>
                <td>{`${faixa.n ?? 0}${faixa.acima ? ' (acima da meta)' : ''}`}</td>
              </tr>
            ))}
            {marcas.map((marca) => (
              <tr key={marca.id}>
                <th scope="row">{marca.rotulo}</th>
                <td>{marca.texto ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
