'use client';
import { useState } from 'react';
import { PeriodoFiltro, usePeriodo } from '@/app/components/PeriodoFiltro';
import { Skeleton } from '@/app/components/ui';
import { useTicketSummary } from '@/app/hooks/useApi';
import { CATEGORIES } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM, CHART } from '@/app/lib/theme';

/**
 * Distribuição das ocorrências por categoria no período, em pizza/rosca.
 *
 * Mostra a proporção das categorias de manutenção (Preventiva, Corretiva,
 * Emergencial, Eventos e Projetos). A rosca exibe a relação entre as partes e
 * o todo com as 5 cores da escala CHART, enquanto a legenda exibe os valores
 * absolutos e percentuais.
 */
const FATIAS_CATEGORIA = CATEGORIES.map((c) => ({
  key: c.value,
  label: c.label,
}));

/**
 * A medida da rosca.
 *
 * 220px com raio de 89px e borda de 26px para ocupar o cartão confortavelmente.
 */
const TAMANHO = 220;
const RAIO = 89;
const GROSSURA = 26;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const RESPIRO = 3;

/** Uma fatia da rosca, desenhada como pedaço tracejado da circunferência. */
function Fatia({ cor, fracao, offset, apagada, onFoco }) {
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

export function OcorrenciasPorCategoriaPizza({ buildingId, className = '', style = {} }) {
  const periodo = usePeriodo();
  const { data, isLoading } = useTicketSummary(buildingId, periodo.params);
  const [emFoco, setEmFoco] = useState(null);

  const contagens = data?.by_category ?? {};
  const fatias = FATIAS_CATEGORIA.map((f) => ({
    ...f,
    valor: contagens[f.key] ?? 0,
  }));

  const total = fatias.reduce((soma, f) => soma + f.valor, 0);

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
      <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>Ocorrências por categoria</h2>
      <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>Distribuição por categoria no período</p>

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
              aria-label={`Ocorrências por categoria, ${total} no total. ${resumo}`}
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

export const OcorrenciasPorStatus = OcorrenciasPorCategoriaPizza;
