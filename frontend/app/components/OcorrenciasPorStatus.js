'use client';
import { useState } from 'react';
import { PeriodoFiltro, usePeriodo } from '@/app/components/PeriodoFiltro';
import { Skeleton } from '@/app/components/ui';
import { useTicketSummary } from '@/app/hooks/useApi';
import { T, R, W, NUM, CHART } from '@/app/lib/theme';

/**
 * Onde estão as ocorrências do período, em pizza.
 *
 * Tomou o lugar do calendário de atividade. O calendário respondia "em que dias
 * se vistoriou", que é a pergunta de quem monta escala; esta tela é a mesa de
 * quem despacha chamado, e a pergunta dela é "quanto de cada coisa está parado
 * comigo".
 *
 * A pizza mostra a proporção de relance, e é só isso que ela faz bem: comparar
 * duas fatias parecidas por ângulo não funciona. Por isso a legenda carrega o
 * número exato e a porcentagem de cada estado — quem precisa comparar lê os
 * números, e a rosca fica com o trabalho que é dela, mostrar o peso de cada
 * parte no todo.
 *
 * As cores são uma rampa de uma matiz só, do começo do caminho ao fim (ver
 * CHART em app/lib/theme.js): estado de chamado é etapa de funil, e cinco cores
 * diferentes diriam "estas coisas não têm ordem entre si", que é falso.
 */

/**
 * As fatias, na ordem do caminho que o chamado faz.
 *
 * EM_ANDAMENTO e AGUARDANDO_TERCEIRO entram na mesma: são o mesmo momento para
 * quem olha de fora — alguém está executando —, e é assim que as listas do
 * produto já os rotulam (ver OCCURRENCE_STATUS_LABEL). AGUARDANDO_FECHAMENTO
 * fica de fora dessa soma porque não é execução: é decisão parada com o
 * moderador, que é justamente o que ele abre esta tela para ver.
 *
 * Isto é mais fino que os contadores do topo, que juntam os três num
 * "Em andamento" só. É de propósito, e os rótulos dizem qual é qual: o topo
 * conta o trabalho em curso, a pizza mostra de que ele é feito.
 */
const FATIAS = [
  { key: 'ABERTO', label: 'Em aberto', de: ['ABERTO'] },
  { key: 'ENCAMINHADO', label: 'Encaminhado', de: ['ENCAMINHADO'] },
  { key: 'ANDAMENTO', label: 'Em andamento', de: ['EM_ANDAMENTO', 'AGUARDANDO_TERCEIRO'] },
  { key: 'AGUARDANDO_FECHAMENTO', label: 'Concluído pelo responsável', de: ['AGUARDANDO_FECHAMENTO'] },
  { key: 'CONCLUIDO', label: 'Finalizado', de: ['CONCLUIDO'] },
];

/**
 * A medida da rosca.
 *
 * Cresceu de 168 para 220 quando o cartão ganhou altura própria no painel (ver
 * `ALTURA_CARTAO`, em app/moderador/page.js): sobrava vão embaixo, e vão embaixo
 * de um gráfico é gráfico pequeno demais, não cartão grande demais. O raio e a
 * grossura acompanham na mesma proporção — a rosca é a mesma peça, maior.
 */
const TAMANHO = 220;
const RAIO = 89;
const GROSSURA = 26;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * O respiro entre fatias, em pixels de arco.
 *
 * A fatia é encurtada por ele, e o que aparece embaixo é o cartão: duas cores
 * vizinhas da mesma rampa encostadas viram uma mancha só, e essa borda é a
 * única coisa que diz onde uma acaba.
 */
const RESPIRO = 3;

/** Uma fatia da rosca, desenhada como pedaço tracejado da circunferência. */
function Fatia({ cor, fracao, offset, apagada, onFoco }) {
  // Fatia menor que o respiro não pode sumir: o buraco que ela deixaria no anel
  // mentiria sobre o total. Abaixo desse tamanho ela abre mão do respiro.
  const arco = fracao * CIRCUNFERENCIA;
  const desenhado = arco > RESPIRO + 1.5 ? arco - RESPIRO : arco;

  return (
    <circle
      cx={TAMANHO / 2}
      cy={TAMANHO / 2}
      r={RAIO}
      fill="none"
      stroke={cor}
      strokeWidth={GROSSURA}
      strokeDasharray={`${desenhado} ${CIRCUNFERENCIA - desenhado}`}
      strokeDashoffset={-offset * CIRCUNFERENCIA}
      onMouseEnter={onFoco}
      onMouseLeave={() => onFoco(null)}
      style={{ opacity: apagada ? 0.32 : 1, transition: 'opacity 0.15s' }}
    />
  );
}

export function OcorrenciasPorStatus({ buildingId, className = '', style = {} }) {
  const periodo = usePeriodo();
  const { data, isLoading } = useTicketSummary(buildingId, periodo.params);
  const [emFoco, setEmFoco] = useState(null);

  const contagens = data?.by_status ?? {};
  const fatias = FATIAS.map((f) => ({
    ...f,
    valor: f.de.reduce((soma, s) => soma + (contagens[s] ?? 0), 0),
  }));

  // O total sai do servidor: somar as fatias aqui daria outro número no dia em
  // que um estado novo entrar no enum e ainda não tiver fatia desenhada.
  const total = data?.total ?? 0;

  // O deslocamento de cada fatia é tudo o que veio antes dela — a rosca é uma
  // volta só, e cada pedaço começa onde o anterior parou. Num `reduce`, e não
  // num contador ao lado do `map`: o compilador do React recusa variável que o
  // render vai remexendo, e aqui o acumulado é a própria lista sendo montada.
  const comOffset = fatias.reduce((ate, f) => {
    const fracao = total > 0 ? f.valor / total : 0;
    const anterior = ate[ate.length - 1];
    const offset = anterior ? anterior.offset + anterior.fracao : 0;
    return [...ate, { ...f, fracao, offset }];
  }, []);

  const resumo = comOffset
    .filter((f) => f.valor > 0)
    .map((f) => `${f.label}: ${f.valor}`)
    .join(', ');

  return (
    <div
      className={className}
      style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: 20, ...style }}
    >
      <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>Ocorrências por status</h2>
      <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>Onde está cada chamado do período</p>

      <PeriodoFiltro
        year={periodo.year}
        month={periodo.month}
        onYear={periodo.setYear}
        onMonth={periodo.setMonth}
        style={{ marginTop: 14 }}
      />

      {isLoading ? (
        <Skeleton style={{ height: TAMANHO, width: TAMANHO, borderRadius: '50%', margin: '20px auto' }} />
      ) : total === 0 ? (
        <p style={{ color: T.mute, fontSize: 13, textAlign: 'center', padding: '54px 8px', lineHeight: 1.6 }}>
          Nenhuma ocorrência neste período
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, position: 'relative' }}>
            <svg
              width={TAMANHO}
              height={TAMANHO}
              viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
              role="img"
              aria-label={`Ocorrências por status, ${total} no total. ${resumo}`}
              // Começa às 12h: uma volta que principia à direita não tem começo
              // aparente, e a primeira fatia é a primeira etapa do caminho.
              style={{ transform: 'rotate(-90deg)' }}
            >
              {comOffset.map((f, i) =>
                f.valor > 0 ? (
                  <Fatia
                    key={f.key}
                    cor={CHART[i]}
                    fracao={f.fracao}
                    offset={f.offset}
                    apagada={emFoco !== null && emFoco !== f.key}
                    onFoco={(v) => setEmFoco(v === null ? null : f.key)}
                  />
                ) : null
              )}
            </svg>

            {/* O total no miolo: o buraco da rosca é o único lugar da tela onde
                ele não disputa espaço com nada. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              }}
            >
              <span style={{ color: T.text, fontFamily: T.display, fontSize: 30, fontWeight: W.title, ...NUM }}>
                {total}
              </span>
              <span style={{ color: T.mute, fontSize: 12 }}>
                {total === 1 ? 'ocorrência' : 'ocorrências'}
              </span>
            </div>
          </div>

          {/* A legenda é também a tabela: o número exato de cada estado mora
              aqui, e é ele que responde "quantos" — o ângulo não responde. E é
              o que tira a cor de sozinha: quem não distingue dois degraus
              vizinhos da rampa lê o nome do estado ao lado. */}
          <ul style={{ listStyle: 'none', margin: '18px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {comOffset.map((f, i) => (
              <li
                key={f.key}
                onMouseEnter={() => setEmFoco(f.key)}
                onMouseLeave={() => setEmFoco(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', borderRadius: 8,
                  background: emFoco === f.key ? T.chip : 'transparent',
                  transition: 'background-color 0.15s',
                  opacity: f.valor === 0 ? 0.5 : 1,
                }}
              >
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: CHART[i], flexShrink: 0 }} />
                <span style={{ color: T.mute, fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.label}
                </span>
                <span style={{ color: T.text, fontSize: 12, ...NUM }}>{f.valor}</span>
                <span style={{ color: T.faint, fontSize: 11, width: 34, textAlign: 'right', ...NUM }}>
                  {Math.round((f.valor / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
