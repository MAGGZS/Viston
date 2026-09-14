'use client';
import { Skeleton } from '@/app/components/ui';
import { T, W } from '@/app/lib/theme';
import { Linha } from './Linha';
import { ESPACO, TIPO } from './escala';

/**
 * O ano mês a mês: a fila cresceu ou encolheu, e quando.
 *
 * Duas leituras empilhadas sobre o mesmo eixo de meses, e a de cima é a que
 * conta a história.
 *
 * **A linha, em cima: a fila acumulada.** O saldo mensal oscila em torno do
 * zero, e a barra de um mês bom é igual à de um mês ruim — um prédio que abre
 * cinco a mais todo mês tem doze barrinhas modestas e uma fila que dobrou no
 * ano. A soma corrida é onde isso aparece, e ela parte do que já estava aberto
 * em janeiro (`evolucao.saldo_inicial`): começar no zero diria que o prédio
 * entrou no ano sem nada pendente.
 *
 * **As barras, embaixo: o saldo de cada mês.** É o detalhe de onde a linha
 * mexeu — para cima a fila cresceu, para baixo encolheu, e o tamanho é o
 * quanto. Continuam sendo por onde se troca o filtro de mês.
 *
 * Dois desenhos, e não dois eixos verticais num só: as grandezas são diferentes
 * — uma é estoque, a outra é fluxo —, e um eixo duplo deixa o leitor comparar
 * alturas que não se comparam. Empilhados, o eixo horizontal é partilhado e
 * cada grandeza tem a escala dela.
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

  // `saldo`, `acumulado` e `futuro` vêm do servidor desde que a fila acumulada
  // entrou; o cálculo local sobrevive para não quebrar com resposta antiga em
  // cache do React Query enquanto o deploy não passa pelas duas pontas.
  const comSaldo = meses.map((m) => ({ ...m, saldo: m.saldo ?? m.abertos - m.fechados }));
  const teto = Math.max(...comSaldo.map((m) => Math.abs(m.saldo)), 1);
  const houveMovimento = comSaldo.some((m) => m.abertos > 0 || m.fechados > 0);
  const temAcumulado = comSaldo.some((m) => m.acumulado !== undefined && m.acumulado !== null);

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

  // A fila acumulada, como a `Linha` a consome. O mês que ainda não aconteceu
  // vai marcado: o valor dele é herdado, não medido, e a linha para ali.
  const fila = comSaldo.map((m) => ({
    id: m.mes,
    valor: m.acumulado,
    futuro: Boolean(m.futuro),
    rotulo: MESES[m.mes - 1],
    rotuloCompleto: `${MESES[m.mes - 1]} de ${evolucao.year}`,
    texto: `${m.acumulado} em aberto`,
    destaque: mesSelecionado === m.mes,
    nota: m.futuro
      ? null
      : `${m.abertos} ${m.abertos === 1 ? 'aberto' : 'abertos'}, ${m.fechados} ${m.fechados === 1 ? 'fechado' : 'fechados'}`,
  }));

  const ultimoMedido = [...fila].reverse().find((p) => !p.futuro);

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
        {/* O estoque, e não só o fluxo: "entraram 4 a mais" não diz se a fila
            tem 4 ou 40, e é o tamanho dela que decide se falta gente. */}
        {ultimoMedido && (
          <>
            {' '}
            Hoje são{' '}
            <span style={{ color: T.text, fontWeight: W.title }}>
              {ultimoMedido.valor} em aberto
            </span>
            {evolucao.saldo_inicial > 0 && (
              <>, contra {evolucao.saldo_inicial} no começo do ano</>
            )}
            .
          </>
        )}
      </p>

      {/* A fila acumulada, em cima. Sem rótulos próprios: o eixo de meses é o
          mesmo das barras logo abaixo, e dois "jan fev mar" empilhados diriam
          que são dois eixos. */}
      {temAcumulado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.xs }}>
          <span style={{ ...TIPO.eyebrow, color: T.faint }}>
            fila em aberto, mês a mês
          </span>
          <Linha
            pontos={fila}
            medida="Chamados em aberto"
            rotulos={false}
            alturaMinima={92}
            alturaMaxima={140}
            onSelecionar={
              onSelecionarMes
                ? (p) => onSelecionarMes(mesSelecionado === p.id ? '' : String(p.id))
                : undefined
            }
          />
        </div>
      )}

      {temAcumulado && (
        <span style={{ ...TIPO.eyebrow, color: T.faint }}>saldo do mês</span>
      )}

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
        {comSaldo.map((m, i) => {
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
                ? {
                    type: 'button',
                    onClick: () => onSelecionarMes(selecionado ? '' : String(m.mes)),
                    // `press` é o encolher de 3% enquanto o dedo está em cima.
                    // Aqui vale porque o mês é alvo compacto e o clique troca a
                    // tela inteira — a peça precisa dizer que ouviu antes de a
                    // consulta voltar.
                    className: 'btn press',
                  }
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
                      borderRadius: '3px 3px 0 0',
                      // Cascata da esquerda para a direita: o ano se desenha na
                      // ordem em que ele aconteceu. 25ms por mês — doze peças a
                      // 45 dariam meio segundo até dezembro chegar.
                      transition: 'height 260ms var(--ease-saida)',
                      transitionDelay: `${i * 25}ms`,
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
                      borderRadius: '0 0 3px 3px',
                      transition: 'height 260ms var(--ease-saida)',
                      transitionDelay: `${i * 25}ms`,
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
            {temAcumulado && <th scope="col">Em aberto ao fim do mês</th>}
          </tr>
          {comSaldo.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{MESES[m.mes - 1]}</th>
              <td>{m.abertos}</td>
              <td>{m.fechados}</td>
              <td>{m.saldo > 0 ? `+${m.saldo}` : m.saldo}</td>
              {temAcumulado && <td>{m.futuro ? 'ainda não aconteceu' : m.acumulado}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
