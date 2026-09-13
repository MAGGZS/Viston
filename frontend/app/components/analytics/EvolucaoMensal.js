'use client';
import { Skeleton } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';
import { ESPACO, TIPO } from './escala';

/**
 * O ano mês a mês: a fila cresceu ou encolheu, e quando.
 *
 * O saldo, e não duas séries lado a lado. Doze meses com duas colunas cada dão
 * vinte e quatro barras num cartão largo, e a pergunta — "estamos fechando mais
 * do que abrindo?" — vira uma conta de subtração que o leitor faz de cabeça,
 * par a par. Uma coluna por mês em torno de uma linha de zero responde isso sem
 * conta nenhuma: para cima a fila cresceu, para baixo encolheu, e o tamanho é o
 * quanto.
 *
 * Os números que a subtração esconde não somem — abertos e fechados estão no
 * `title` de cada mês e na tabela equivalente, que é onde se vai quando se quer
 * o detalhe, não quando se quer a forma.
 *
 * O mês filtrado ganha um anel, e não cor: é "você está aqui", não "olhe para
 * cá". O dourado desta tela é do gargalo do funil, e gastar a mesma tinta numa
 * marca de posição faria as duas deixarem de significar.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** A metade de cima e a de baixo, em px. O zero fica no meio. */
const META_ALTURA = 64;

/** O piso visível de um saldo diferente de zero. */
const PISO = 3;

export function EvolucaoMensal({ evolucao, mesSelecionado, loading, onSelecionarMes }) {
  if (loading) return <Skeleton style={{ height: 190 }} />;

  const meses = evolucao?.meses ?? [];
  if (meses.length === 0) return null;

  const comSaldo = meses.map((m) => ({ ...m, saldo: m.abertos - m.fechados }));
  const teto = Math.max(...comSaldo.map((m) => Math.abs(m.saldo)), 1);
  const houveMovimento = comSaldo.some((m) => m.abertos > 0 || m.fechados > 0);

  if (!houveMovimento) {
    return (
      <p style={{ ...TIPO.meta, color: T.faint }}>
        Nenhum chamado aberto ou fechado em {evolucao.year}.
      </p>
    );
  }

  const totalAbertos = comSaldo.reduce((s, m) => s + m.abertos, 0);
  const totalFechados = comSaldo.reduce((s, m) => s + m.fechados, 0);
  const pior = comSaldo.reduce((a, b) => (b.saldo > a.saldo ? b : a));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.md }}>
      {/* A conclusão antes do desenho, como no funil: quem passa os olhos leva
          a resposta, e o gráfico fica para quem quer ver a forma do ano. */}
      <p style={{ ...TIPO.corpo, color: T.mute }}>
        {totalAbertos === totalFechados ? (
          <>O ano fechou o que abriu: {totalAbertos} de cada lado.</>
        ) : totalAbertos > totalFechados ? (
          <>
            Entraram{' '}
            <span style={{ color: T.text, fontWeight: W.title }}>
              {totalAbertos - totalFechados} a mais
            </span>{' '}
            do que saíram no ano
            {pior.saldo > 0 && <> — o mês que mais acumulou foi {MESES[pior.mes - 1]}</>}.
          </>
        ) : (
          <>
            Saíram{' '}
            <span style={{ color: T.text, fontWeight: W.title }}>
              {totalFechados - totalAbertos} a mais
            </span>{' '}
            do que entraram no ano. A fila encolheu.
          </>
        )}
      </p>

      {/* A linha de zero atravessa os doze meses de uma vez, por trás das
          colunas. Desenhada dentro de cada célula, ela ganhava o vão entre as
          colunas e virava um tracejado — e uma linha de base picotada deixa de
          se ler como base. */}
      <div style={{ position: 'relative' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, right: 0,
            top: ESPACO.xs + META_ALTURA,
            height: 1, background: T.line,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 3 }}>
        {comSaldo.map((m) => {
          const selecionado = mesSelecionado === m.mes;
          const vazio = m.abertos === 0 && m.fechados === 0;
          const altura = m.saldo === 0 ? 0 : Math.max(PISO, (Math.abs(m.saldo) / teto) * META_ALTURA);
          const cresceu = m.saldo > 0;

          const descricao = vazio
            ? `${MESES[m.mes - 1]}: sem movimento`
            : `${MESES[m.mes - 1]}: ${m.abertos} abertos, ${m.fechados} fechados, saldo ${m.saldo > 0 ? '+' : ''}${m.saldo}`;

          const Marca = onSelecionarMes ? 'button' : 'div';

          return (
            <Marca
              key={m.mes}
              {...(onSelecionarMes
                ? { type: 'button', onClick: () => onSelecionarMes(selecionado ? '' : String(m.mes)), className: 'btn' }
                : {})}
              title={descricao}
              aria-label={onSelecionarMes ? `Filtrar por ${descricao}` : undefined}
              aria-pressed={onSelecionarMes ? selecionado : undefined}
              style={{
                flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                cursor: onSelecionarMes ? 'pointer' : 'default',
                padding: `${ESPACO.xs}px 0`, borderRadius: 6,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                // O anel diz "é este o mês do filtro" sem gastar a cor de
                // destaque, que nesta tela pertence ao gargalo.
                boxShadow: selecionado ? `inset 0 0 0 1px ${T.line}` : 'none',
              }}
            >
              {/* Metade de cima: o que cresceu. */}
              <span
                aria-hidden="true"
                style={{
                  width: '100%', maxWidth: 34, height: META_ALTURA,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                }}
              >
                {cresceu && (
                  <span
                    style={{
                      width: '100%', height: altura, background: T.danger, opacity: 0.85,
                      borderRadius: '3px 3px 0 0', transition: 'height 260ms ease',
                    }}
                  />
                )}
              </span>

              {/* O lugar da linha de zero, desenhada contínua atrás de todas. */}
              <span aria-hidden="true" style={{ width: '100%', height: 1, flexShrink: 0 }} />

              {/* Metade de baixo: o que encolheu. */}
              <span
                aria-hidden="true"
                style={{
                  width: '100%', maxWidth: 34, height: META_ALTURA,
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                }}
              >
                {!cresceu && m.saldo !== 0 && (
                  <span
                    style={{
                      width: '100%', height: altura, background: T.mute, opacity: 0.45,
                      borderRadius: '0 0 3px 3px', transition: 'height 260ms ease',
                    }}
                  />
                )}
              </span>

              {/* Minúsculas e sem entreletra, ao contrário dos outros rótulos
                  de eixo da tela.

                  Doze rótulos numa largura de telefone dão células de 20px, e
                  "JAN" em caixa alta com 0.14em de entreletra mede 26 — o texto
                  não encolhe, então ele empurrava, e a página inteira passava a
                  rolar de lado. A largura fixa com `overflow: hidden` é o cinto
                  de segurança: nenhum rótulo de mês pode alargar a coluna dele. */}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: W.strong,
                  // Entreletra negativa: sem ela "mar" mede 21px numa célula
                  // de 20 no telefone, e o rótulo saía cortado no meio.
                  letterSpacing: '-0.02em',
                  color: selecionado ? T.text : T.faint,
                  // O mês sem movimento continua legível, só rebaixado: em
                  // `T.line` ele sumia, e um eixo com buracos deixa de ser eixo.
                  opacity: vazio ? 0.45 : 1,
                  marginTop: ESPACO.sm,
                  width: '100%', textAlign: 'center', overflow: 'hidden',
                }}
              >
                {MESES[m.mes - 1]}
              </span>
            </Marca>
          );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: ESPACO.lg, flexWrap: 'wrap' }}>
        <span style={{ ...TIPO.meta, color: T.faint, display: 'inline-flex', alignItems: 'center', gap: ESPACO.xs }}>
          <span aria-hidden="true" style={{ width: 10, height: 6, borderRadius: 2, background: T.danger, opacity: 0.85 }} />
          acima da linha: entrou mais do que saiu
        </span>
        <span style={{ ...TIPO.meta, color: T.faint, display: 'inline-flex', alignItems: 'center', gap: ESPACO.xs }}>
          <span aria-hidden="true" style={{ width: 10, height: 6, borderRadius: 2, background: T.mute, opacity: 0.45 }} />
          abaixo: saiu mais do que entrou
        </span>
      </div>

      {/* A tabela equivalente vai dentro de uma `div`, e não com a classe nela.
          `.so-leitor` encolhe a caixa para 1px e esconde o resto com
          `overflow: hidden` — que não vale para uma caixa de tabela. O
          resultado era uma tabela invisível de 394px empurrando a página do
          telefone para o lado, e ninguém enxergando o que empurrava. */}
      <div className="so-leitor">
      <table>
        <caption>Chamados abertos e fechados por mês em {evolucao.year}</caption>
        <tbody>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Abertos</th>
            <th scope="col">Fechados</th>
            <th scope="col">Saldo</th>
          </tr>
          {comSaldo.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{MESES[m.mes - 1]}</th>
              <td>{m.abertos}</td>
              <td>{m.fechados}</td>
              <td>{m.saldo > 0 ? `+${m.saldo}` : m.saldo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
