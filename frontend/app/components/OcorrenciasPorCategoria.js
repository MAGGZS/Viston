'use client';
import { PeriodoFiltro, usePeriodo } from '@/app/components/PeriodoFiltro';
import { Skeleton } from '@/app/components/ui';
import { useTicketSummary } from '@/app/hooks/useApi';
import { CATEGORIES } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM, CHART_MARK } from '@/app/lib/theme';

/**
 * Quanto de cada categoria o prédio produziu no período.
 *
 * Barra, e não outra pizza. As duas leituras são diferentes: a pizza responde
 * "que parte do todo", e é por isso que ela serve aos estados — eles somam um
 * caminho só. Aqui a pergunta é "qual categoria dá mais trabalho", que é
 * comparação de tamanho entre cinco coisas independentes, e comprimento
 * ordenado responde isso de relance; ângulo não.
 *
 * Uma cor só nas barras, de propósito: o comprimento já diz o tamanho, e pintar
 * cada categoria de uma cor gastaria o canal da identidade repetindo o que a
 * barra mostra sozinha — e daria a entender que as cores significam alguma
 * coisa além de "esta é a linha da preventiva".
 *
 * O período é o mesmo controle do cartão de status, com estado próprio: são
 * duas perguntas sobre o mesmo prédio, e amarrá-las obrigaria quem quer o ano
 * inteiro num gráfico e um mês no outro a escolher qual dos dois responder.
 */

/** A altura da barra. Marca fina: bloco grosso e saturado grita sem dizer mais. */
const BARRA = 10;

export function OcorrenciasPorCategoria({ buildingId, className = '' }) {
  const periodo = usePeriodo();
  const { data, isLoading } = useTicketSummary(buildingId, periodo.params);

  const contagens = data?.by_category ?? {};

  // Da maior para a menor: a pergunta é "qual dá mais trabalho", e a resposta
  // tem de ser a primeira linha. A ordem do enum não quer dizer nada aqui.
  const linhas = CATEGORIES.map((c) => ({ ...c, valor: contagens[c.value] ?? 0 })).sort(
    (a, b) => b.valor - a.valor || a.label.localeCompare(b.label, 'pt-BR')
  );

  const total = linhas.reduce((soma, l) => soma + l.valor, 0);
  // A escala é a maior barra, não o total: com cinco categorias parecidas,
  // medir cada uma contra a soma deixaria todas curtas e iguais.
  const maior = Math.max(...linhas.map((l) => l.valor), 1);

  const resumo = linhas
    .filter((l) => l.valor > 0)
    .map((l) => `${l.label}: ${l.valor}`)
    .join(', ');

  return (
    <div
      className={className}
      style={{ background: T.card, borderRadius: R.card, boxShadow: T.cardRing, padding: '20px 22px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>Ocorrências por categoria</h2>
          <p style={{ color: T.mute, fontSize: 12, marginTop: 3 }}>
            Que tipo de trabalho o prédio deu no período, da categoria que mais pesou para a que menos
          </p>
        </div>

        {/* Os filtros à direita do título: aqui o cartão é largo, e empurrá-los
            para baixo dele abriria uma faixa vazia antes da primeira barra. */}
        <PeriodoFiltro
          year={periodo.year}
          month={periodo.month}
          onYear={periodo.setYear}
          onMonth={periodo.setMonth}
        />
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
          {CATEGORIES.map((c) => (
            <Skeleton key={c.value} style={{ height: BARRA + 18 }} />
          ))}
        </div>
      ) : total === 0 ? (
        <p style={{ color: T.mute, fontSize: 13, textAlign: 'center', padding: '46px 8px', lineHeight: 1.6 }}>
          Nenhuma ocorrência neste período
        </p>
      ) : (
        <ul
          role="img"
          aria-label={`Ocorrências por categoria, ${total} no total. ${resumo}`}
          style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {linhas.map((l, idx) => (
            <li key={l.value} className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ color: T.text, fontSize: 13 }}>{l.label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexShrink: 0 }}>
                  <span style={{ color: T.text, fontSize: 13, ...NUM }}>{l.valor}</span>
                  <span style={{ color: T.faint, fontSize: 11, ...NUM }}>
                    {Math.round((l.valor / total) * 100)}%
                  </span>
                </span>
              </div>

              {/* O trilho vai até a borda mesmo quando a barra é curta: sem ele
                  não há contra o que ler o comprimento de uma barra sozinha. */}
              <div style={{ height: BARRA, borderRadius: BARRA / 2, background: T.chip, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    // Zero fica em zero: uma sobra mínima "para a barra
                    // aparecer" faria o vazio parecer pouco, e não nada.
                    width: `${(l.valor / maior) * 100}%`,
                    background: CHART_MARK,
                    borderRadius: BARRA / 2,
                    transition: 'width 0.3s ease-out',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
