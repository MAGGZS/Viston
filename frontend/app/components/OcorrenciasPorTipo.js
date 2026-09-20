'use client';
import { useState } from 'react';
import { PeriodoFiltro, usePeriodo } from '@/app/components/PeriodoFiltro';
import { Skeleton } from '@/app/components/ui';
import { useTicketSummary } from '@/app/hooks/useApi';
import { MAINTENANCE_TYPES } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM, CHART_MARK } from '@/app/lib/theme';

/**
 * Volume de cada tipo de ocorrência no período, em gráfico de colunas verticais.
 *
 * Coluna, e não barra deitada: a altura é a leitura mais direta para comparar
 * grandezas independentes entre os 13 tipos de ocorrência cadastrados.
 * As colunas são ordenadas da mais frequente para a menos frequente.
 */

const ALTURA_DESENHO = 150;
const PISO = 4;

/**
 * As alturas das colunas do esqueleto, enquanto o período não chega.
 *
 * Fixas, e não sorteadas. Eram `Math.random()` dentro do render, e isso custava
 * três coisas: o servidor desenhava uma altura e o cliente outra, a coluna
 * pulava a cada novo quadro, e o render deixava de ser função só das
 * propriedades — que é o que o compilador do React exige para otimizar o
 * componente. Uma lista fixa dá a mesma variação sem nenhuma das três.
 */
const ALTURAS_ESQUELETO = [96, 62, 118, 50, 84, 108, 70, 128, 58, 92, 76, 112, 66];

export function OcorrenciasPorTipo({ buildingId, className = '', style = {} }) {
  const periodo = usePeriodo();
  const { data, isLoading } = useTicketSummary(buildingId, periodo.params);
  const [emFoco, setEmFoco] = useState(null);

  const contagens = data?.by_type ?? {};

  // Ordena do mais frequente ao menos frequente
  const colunas = MAINTENANCE_TYPES.map((t) => ({
    ...t,
    valor: contagens[t.value] ?? 0,
  })).sort((a, b) => b.valor - a.valor || a.label.localeCompare(b.label, 'pt-BR'));

  const total = colunas.reduce((soma, c) => soma + c.valor, 0);
  const maior = Math.max(...colunas.map((c) => c.valor), 1);

  const resumo = colunas
    .filter((c) => c.valor > 0)
    .map((c) => `${c.label}: ${c.valor}`)
    .join(', ');

  return (
    <div
      className={className}
      style={{
        background: T.card,
        borderRadius: R.card,
        boxShadow: T.cardRing,
        padding: '20px 22px',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>Ocorrências por tipo</h2>
          <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
            Volume de chamados por tipo de ocorrência no período, do mais frequente para o menos
          </p>
        </div>

        <PeriodoFiltro
          year={periodo.year}
          month={periodo.month}
          onYear={periodo.setYear}
          onMonth={periodo.setMonth}
        />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 28, alignItems: 'flex-end', height: ALTURA_DESENHO + 50 }}>
          {MAINTENANCE_TYPES.map((t, i) => (
            <div key={t.value} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <Skeleton style={{ height: 14, width: 20 }} />
              <Skeleton style={{ height: ALTURAS_ESQUELETO[i % ALTURAS_ESQUELETO.length], width: '100%', borderRadius: '4px 4px 0 0' }} />
              <Skeleton style={{ height: 12, width: 36 }} />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <p style={{ color: T.mute, fontSize: 13, textAlign: 'center', padding: '56px 8px', lineHeight: 1.6 }}>
          Nenhuma ocorrência neste período
        </p>
      ) : (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <div
            role="img"
            aria-label={`Ocorrências por tipo, ${total} no total. ${resumo}`}
            style={{
              minWidth: 720,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* Linha das Colunas */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 10,
                height: ALTURA_DESENHO,
                paddingBottom: 2,
              }}
            >
              {colunas.map((c) => {
                const temValor = c.valor > 0;
                const alturaPct = temValor ? Math.max(PISO, (c.valor / maior) * 100) : 0;
                const foco = emFoco === c.value;

                return (
                  <div
                    key={c.value}
                    onMouseEnter={() => setEmFoco(c.value)}
                    onMouseLeave={() => setEmFoco(null)}
                    style={{
                      flex: 1,
                      minWidth: 44,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'default',
                    }}
                    title={`${c.label}: ${c.valor} (${total > 0 ? Math.round((c.valor / total) * 100) : 0}%)`}
                  >
                    {/* Contagem no topo */}
                    <span
                      style={{
                        color: foco ? T.text : temValor ? T.mute : T.faint,
                        fontSize: 12,
                        fontWeight: foco || temValor ? W.title : W.body,
                        lineHeight: 1,
                        transition: 'color 0.15s',
                        ...NUM,
                      }}
                    >
                      {temValor ? c.valor : '—'}
                    </span>

                    {/* Trilho e Coluna Preenchida */}
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 48,
                        height: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                        background: T.chip,
                        borderRadius: '4px 4px 0 0',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${alturaPct}%`,
                          background: foco ? T.accent : CHART_MARK,
                          opacity: temValor ? (foco ? 1 : 0.88) : 0,
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s, opacity 0.15s',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Linha de Base */}
            <div style={{ height: 1, background: T.line, width: '100%' }} />

            {/* Rótulos e Percentuais */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              {colunas.map((c) => {
                const foco = emFoco === c.value;
                const pct = total > 0 ? Math.round((c.valor / total) * 100) : 0;

                return (
                  <div
                    key={c.value}
                    onMouseEnter={() => setEmFoco(c.value)}
                    onMouseLeave={() => setEmFoco(null)}
                    style={{
                      flex: 1,
                      minWidth: 44,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        color: foco ? T.text : c.valor > 0 ? T.text : T.faint,
                        fontSize: 11,
                        fontWeight: foco ? W.title : W.body,
                        lineHeight: 1.25,
                        wordBreak: 'break-word',
                        hyphens: 'auto',
                        width: '100%',
                        transition: 'color 0.15s',
                      }}
                      title={c.label}
                    >
                      {c.label}
                    </span>
                    <span
                      style={{
                        color: T.faint,
                        fontSize: 10,
                        ...NUM,
                      }}
                    >
                      {c.valor > 0 ? `${pct}%` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Acessibilidade para leitor de tela */}
      <div className="so-leitor">
        <table>
          <caption>Ocorrências por tipo</caption>
          <tbody>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Ocorrências</th>
              <th scope="col">Porcentagem</th>
            </tr>
            {colunas.map((c) => (
              <tr key={c.value}>
                <th scope="row">{c.label}</th>
                <td>{c.valor}</td>
                <td>{total > 0 ? `${Math.round((c.valor / total) * 100)}%` : '0%'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
