'use client';
import { Skeleton } from '@/app/components/ui';
import { T, W, NUM, SERIE } from '@/app/lib/theme';
import { Celula, Figura } from './CartaoMetrica';
import { ESPACO, TIPO } from './escala';

/**
 * A fila em aberto agora — e o antídoto do número que mais engana no painel.
 *
 * O tempo de resolução conta só o que fechou. Enquanto o prédio piora, o
 * chamado lento fica de fora da conta e o número *melhora*: um chamado parado
 * há quarenta dias não entra em nenhuma média até alguém o fechar. É viés de
 * sobrevivência, e num painel de manutenção ele sempre aponta para o mesmo
 * lado — o otimista.
 *
 * O antídoto não é um número melhor, é um par. "Metade fechou em 5 dias úteis"
 * ao lado de "o que está aberto já tem 19 de mediana" é a frase que nenhum dos
 * dois diz sozinho. Por isso este bloco existe separado, no alto da tela, e por
 * isso ele carrega os percentis de ciclo junto com a idade da fila: separá-los
 * em dois cartões seria deixar o leitor fazer a comparação de memória.
 *
 * Tudo aqui é de agora e do prédio inteiro, sem recorte de período. Um chamado
 * aberto em março continua aberto em setembro, e escondê-lo porque o filtro diz
 * "setembro" seria a tela ajudando a esquecê-lo.
 */

const dias = (n) =>
  n === null || n === undefined ? '—' : `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;

/** Um dígito decimal, vírgula: a mesma escrita dos outros números do painel. */
const comDecimal = (n) =>
  n === null || n === undefined ? null : n.toFixed(1).replace('.', ',');

/** Quantos dias úteis de idade já são velhice para um chamado em aberto. */
const VELHO_DEMAIS = 15;

export function FilaHoje({ fila, kpis, loading }) {
  if (loading) return <Skeleton style={{ height: 200 }} />;
  if (!fila) return null;

  const p50 = comDecimal(kpis?.ciclo_p50_dias_uteis);
  const p90 = comDecimal(kpis?.ciclo_p90_dias_uteis);
  const fechados = kpis?.amostra?.fechados ?? 0;
  const minimo = kpis?.amostra?.minimo ?? 5;
  const poucos = fechados < minimo;

  const velho = fila.mais_velho_dias_uteis !== null && fila.mais_velho_dias_uteis > VELHO_DEMAIS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.lg, flex: 1, minHeight: 0 }}>
      <Figura
        valor={fila.em_aberto}
        rotulo={fila.em_aberto === 1 ? 'chamado em aberto' : 'chamados em aberto'}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: ESPACO.lg,
        }}
      >
        {/* "19 d", e não "19 dias úteis", na figura.
            Por extenso, o número quebra em duas linhas numa célula de 120px e
            deixa de se comparar de relance com a célula ao lado — que é a única
            coisa que uma figura grande existe para permitir. A unidade por
            extenso fica na nota embaixo e na tabela, e "d" é a mesma abreviação
            que o bloco de SLA já usa. */}
        <Celula
          rotulo="Idade mediana"
          valor={fila.mediana_dias_uteis === null ? '—' : Math.round(fila.mediana_dias_uteis)}
          sufixo={fila.mediana_dias_uteis === null ? null : 'd'}
          nota="metade da fila espera há mais tempo que isto, em dias úteis"
          proporcao={
            fila.mediana_dias_uteis === null || !fila.mais_velho_dias_uteis
              ? null
              : fila.mediana_dias_uteis / fila.mais_velho_dias_uteis
          }
          cor={SERIE.ciano}
        />
        <Celula
          rotulo="O mais antigo"
          valor={fila.mais_velho_dias_uteis ?? '—'}
          sufixo={fila.mais_velho_dias_uteis === null ? null : 'd'}
          alerta={velho}
          nota={
            velho
              ? `acima de ${VELHO_DEMAIS} dias úteis em aberto`
              : 'nada apodrecendo no fundo da fila'
          }
          // O mais antigo é o teto da própria escala: a barra cheia é o que dá
          // sentido à fração que a mediana desenha ao lado.
          proporcao={fila.mais_velho_dias_uteis === null ? null : 1}
          cor={SERIE.ciano}
        />
        <Celula
          rotulo="Sem movimento"
          valor={fila.sem_movimento}
          alerta={fila.sem_movimento > 0}
          nota={`ninguém tocou há ${fila.sem_movimento_desde_dias} dias úteis ou mais`}
          // Quanto da fila está esquecida — a única das três que é parte de um
          // todo, e por isso a única cuja barra se lê como percentual.
          proporcao={fila.em_aberto > 0 ? fila.sem_movimento / fila.em_aberto : null}
          cor={SERIE.ciano}
        />
      </div>

      {/* O par que desarma o viés. Fica no fim, e não no topo, porque ele é
          leitura sobre a leitura: só faz sentido depois de o leitor ter visto
          quantos estão em aberto e há quanto tempo. */}
      {p50 && (
        <div
          style={{
            borderTop: `1px solid ${T.line}`,
            paddingTop: ESPACO.md,
            display: 'flex', flexDirection: 'column', gap: ESPACO.xs,
          }}
        >
          <span style={{ ...TIPO.eyebrow, color: T.faint }}>contra o que já fechou</span>

          <p style={{ ...TIPO.corpo, color: T.mute, lineHeight: 1.5 }}>
            Metade do que fechou no período levou até{' '}
            <span style={{ color: T.text, fontWeight: W.title, ...NUM }}>{p50} d</span>
            {p90 && (
              <>
                , e um décimo passou de{' '}
                <span style={{ color: T.text, fontWeight: W.title, ...NUM }}>{p90} d</span>
              </>
            )}
            .{' '}
            {fila.mediana_dias_uteis !== null && fila.em_aberto > 0 && (
              <>
                O que <em>não</em> fechou já tem {dias(fila.mediana_dias_uteis)} de mediana — e não
                entra em nenhuma dessas contas.
              </>
            )}
          </p>

          {/* A ressalva colada no número, e não no rodapé do cartão: ressalva
              que mora longe do número não é lida junto com ele. */}
          {poucos && (
            <span style={{ ...TIPO.meta, color: T.faint }}>
              {fechados === 0
                ? 'nenhum chamado fechou no período — os percentis são do vazio'
                : `sobre ${fechados} ${fechados === 1 ? 'chamado fechado' : 'chamados fechados'} — poucos para tirar conclusão`}
            </span>
          )}
        </div>
      )}

      <div className="so-leitor">
        <table>
          <caption>A fila em aberto agora, no prédio inteiro</caption>
          <tbody>
            <tr>
              <th scope="col">Medida</th>
              <th scope="col">Valor</th>
            </tr>
            <tr>
              <th scope="row">Chamados em aberto</th>
              <td>{fila.em_aberto}</td>
            </tr>
            <tr>
              <th scope="row">Idade mediana da fila</th>
              <td>{dias(fila.mediana_dias_uteis)}</td>
            </tr>
            <tr>
              <th scope="row">Chamado mais antigo em aberto</th>
              <td>{dias(fila.mais_velho_dias_uteis)}</td>
            </tr>
            <tr>
              <th scope="row">
                Sem movimento há {fila.sem_movimento_desde_dias} dias úteis ou mais
              </th>
              <td>{fila.sem_movimento}</td>
            </tr>
            {p50 && (
              <tr>
                <th scope="row">Tempo de resolução do que fechou (mediana)</th>
                <td>{`${p50} dias úteis, sobre ${fechados} fechados`}</td>
              </tr>
            )}
            {p90 && (
              <tr>
                <th scope="row">Tempo de resolução do que fechou (percentil 90)</th>
                <td>{`${p90} dias úteis`}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

