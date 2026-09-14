'use client';
import { Skeleton } from '@/app/components/ui';
import {
  CATEGORIES,
  MAINTENANCE_TYPES,
  formatCost,
  labelOf,
} from '@/app/lib/maintenanceOptions';
import { T, W, NUM, CHART } from '@/app/lib/theme';
import { Barras } from './Barras';
import { ESPACO, TIPO } from './escala';
import { Linha } from './Linha';
import { Matriz } from './Matriz';

/**
 * O prédio: quanto custou e o que reincide.
 *
 * A terceira aba, e o terceiro assunto. "Processos" fala do caminho que o
 * chamado faz; "Desempenho" fala das pessoas que o fazem andar. Nenhum dos dois
 * fala do prédio — que é o que o cliente do sistema de fato compra, e o único
 * assunto sobre o qual o painel não tinha uma linha.
 *
 * Os três dados desta aba estavam no banco desde o começo e não estavam em
 * lugar nenhum da tela: `maintenance_cost` nunca foi somado, `maintenance_type`
 * e `floor_id` eram filtros e nunca dimensões, `category` era um chip. O painel
 * sabia dizer que quarenta chamados fecharam; não sabia dizer quanto custaram,
 * em que andar, nem que o sétimo andar teve infiltração cinco vezes.
 *
 * **A cobertura vem antes do total, e não depois.** Um valor somado sobre um
 * terço dos chamados fechados, apresentado como "o custo do período", é uma
 * afirmação falsa sobre o prédio — não um número incompleto. Abaixo de
 * `cobertura.minima` o bloco inteiro entra em estado degradado: o número
 * esmaece, e a frase que diz sobre quantos chamados ele fala vem antes dele.
 */

/** O rótulo de andar já vem pronto do servidor; o de tipo e categoria, não. */
const tipo = (chave) => labelOf(MAINTENANCE_TYPES, chave);
const categoria = (chave) => labelOf(CATEGORIES, chave);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Um percentual inteiro, ou travessão. */
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

export function Predio({ dados, loading, mesSelecionado, onSelecionarMes, onFiltrarAndar }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.lg }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 160 }} />
        ))}
      </div>
    );
  }

  if (!dados) return null;

  const { custo, perfil, recorrencia } = dados;
  const cobertura = custo.cobertura;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.xl }}>
      <Custo custo={custo} cobertura={cobertura} periodo={dados.periodo} />

      <PerfilDaManutencao
        perfil={perfil}
        mesSelecionado={mesSelecionado}
        onSelecionarMes={onSelecionarMes}
      />

      <OndeODinheiroFoi custo={custo} cobertura={cobertura} onFiltrarAndar={onFiltrarAndar} />

      <Reincidencia recorrencia={recorrencia} />
    </div>
  );
}

/** O total do período, com a cobertura na frente dele quando ela é baixa. */
function Custo({ custo, cobertura, periodo }) {
  const confiavel = cobertura.confiavel;
  const delta = custo.variacao;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint }}>custo da manutenção</span>

      {/* A ressalva antes do número, e não depois.
          Quem lê "R$ 4.200" já formou a ideia de que aquilo é o custo do
          prédio; a nota de rodapé chega tarde. Quando a cobertura é baixa, a
          frase vem primeiro e o número vem depois dela, esmaecido. */}
      {!confiavel && (
        <p style={{ ...TIPO.corpo, color: T.danger, lineHeight: 1.5 }}>
          {cobertura.n_com_custo === 0
            ? `Nenhum dos ${cobertura.fechados} chamados fechados teve valor lançado. Não há custo a somar.`
            : cobertura.n_com_custo === 1
              ? `Só 1 dos ${cobertura.fechados} chamados fechados tem valor lançado. O número abaixo é o valor desse único chamado — não é o custo do prédio.`
              : `Só ${cobertura.n_com_custo} de ${cobertura.fechados} chamados fechados têm valor lançado. O número abaixo é a soma desses ${cobertura.n_com_custo} — não é o custo do prédio.`}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: ESPACO.md, flexWrap: 'wrap' }}>
        <span
          style={{
            ...TIPO.heroi, ...NUM, lineHeight: 1,
            color: confiavel ? T.text : T.mute,
            opacity: confiavel ? 1 : 0.7,
          }}
        >
          {formatCost(custo.total)}
        </span>

        {/* A variação só quando os dois lados têm cobertura: comparar a soma de
            um chamado com a soma de trinta não é comparar períodos. */}
        {confiavel && delta !== null && delta !== undefined && (
          <span
            style={{
              ...TIPO.corpo, ...NUM,
              color: delta > 0 ? T.danger : T.mute,
              fontWeight: delta > 0 ? W.strong : W.body,
            }}
          >
            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%
            <span style={{ color: T.faint, fontWeight: W.body }}> vs. {periodo.anterior}</span>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: ESPACO.xl, flexWrap: 'wrap' }}>
        <Nota
          rotulo="cobertura"
          valor={`${cobertura.n_com_custo} de ${cobertura.fechados}`}
          detalhe={`${pct(cobertura.pct)} dos fechados têm valor lançado`}
          alerta={!confiavel}
        />
        {/* Mediana ao lado da média, pelo mesmo motivo do tempo de ciclo: uma
            manutenção de vinte mil no meio de dez de trezentos reais faz a
            média dizer dois mil, que não é o preço de nada. */}
        <Nota
          rotulo="valor típico"
          valor={custo.ticket_p50 === null ? '—' : formatCost(custo.ticket_p50)}
          detalhe={
            custo.ticket_medio === null
              ? 'sem valor lançado no período'
              : `mediana · média de ${formatCost(custo.ticket_medio)}`
          }
        />
      </div>
    </section>
  );
}

function Nota({ rotulo, valor, detalhe, alerta = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint }}>{rotulo}</span>
      <span
        style={{
          ...TIPO.titulo, ...NUM,
          color: alerta ? T.danger : T.text, fontWeight: W.title,
        }}
      >
        {valor}
      </span>
      <span style={{ ...TIPO.meta, color: alerta ? T.danger : T.faint }}>{detalhe}</span>
    </div>
  );
}

/**
 * Corretiva contra preventiva, mês a mês.
 *
 * A métrica de maturidade do prédio, e a única desta tela que não depende de
 * ninguém ter lançado custo: a categoria é obrigatória na vistoria. Reativa
 * subindo ao longo do ano é um prédio apagando incêndio; preventiva subindo é
 * um prédio que passou a se antecipar.
 *
 * Uma linha da proporção, e não cinco áreas empilhadas. Cinco categorias
 * empilhadas mostram o volume e escondem a proporção — que é o que a pergunta
 * pede —, e com poucos chamados por mês viram cinco fitas finas ilegíveis. A
 * linha responde direto, e as contagens de cada mês ficam no ponto e na tabela.
 */
function PerfilDaManutencao({ perfil, mesSelecionado, onSelecionarMes }) {
  const houve = perfil.meses.some((m) => m.total > 0);

  if (!houve) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
        <span style={{ ...TIPO.eyebrow, color: T.faint }}>perfil da manutenção</span>
        <p style={{ ...TIPO.meta, color: T.faint }}>
          Nenhuma ocorrência aberta em {perfil.year}.
        </p>
      </section>
    );
  }

  const pontos = perfil.meses.map((m) => ({
    id: m.mes,
    // Mês sem ocorrência não tem proporção — e zero não é "0% de reativa", é
    // ausência. A linha pula o ponto em vez de mergulhar até o chão.
    valor: m.total === 0 ? null : m.pct_reativa,
    futuro: Boolean(m.futuro),
    rotulo: MESES[m.mes - 1],
    rotuloCompleto: `${MESES[m.mes - 1]} de ${perfil.year}`,
    texto: m.total === 0 ? null : `${pct(m.pct_reativa)} reativa`,
    destaque: mesSelecionado === m.mes,
    alerta: m.total > 0 && m.pct_reativa > 50,
    nota:
      m.total === 0
        ? null
        : `${m.CORRETIVA} corretiva, ${m.EMERGENCIAL} emergencial, ${m.PREVENTIVA} preventiva`,
  }));

  const reativa = perfil.pct_reativa;
  const poucos = perfil.amostra.nascidos < perfil.amostra.minimo;
  const medidos = pontos.filter((p) => p.valor !== null && !p.futuro);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint }}>perfil da manutenção</span>

      <p style={{ ...TIPO.corpo, color: T.mute, lineHeight: 1.5 }}>
        <span style={{ color: poucos ? T.mute : T.text, fontWeight: W.title, ...NUM }}>
          {pct(reativa)}
        </span>{' '}
        do que foi aberto no período é corretiva ou emergencial — prédio já quebrado. O resto é
        preventiva, eventos e projetos.
        {poucos && (
          <span style={{ color: T.faint }}>
            {' '}
            Sobre {perfil.amostra.nascidos}{' '}
            {perfil.amostra.nascidos === 1 ? 'ocorrência' : 'ocorrências'} — poucas para tirar
            conclusão.
          </span>
        )}
      </p>

      {/* Uma linha de um ponto só não é gráfico, é enfeite.
          Com um mês de dado no ano inteiro, o desenho é um ponto solto num
          retângulo vazio de 150px — ele não mostra tendência nenhuma, e ocupa a
          tela dizendo que mostra. Abaixo de dois meses medidos, a frase acima já
          disse tudo o que há para dizer, e o detalhe vai na lista. */}
      {medidos.length >= 2 ? (
        <Linha
          pontos={pontos}
          medida="Percentual de manutenção reativa"
          area={false}
          alturaMinima={100}
          alturaMaxima={150}
          onSelecionar={
            onSelecionarMes
              ? (p) => onSelecionarMes(mesSelecionado === p.id ? '' : String(p.id))
              : undefined
          }
        />
      ) : (
        <p style={{ ...TIPO.meta, color: T.faint }}>
          {`Um mês só com ocorrências em ${perfil.year} — ${medidos[0].nota}. A tendência aparece quando houver um segundo mês.`}
        </p>
      )}
    </section>
  );
}

/** Onde o dinheiro foi: por tipo e por andar, lado a lado. */
function OndeODinheiroFoi({ custo, cobertura, onFiltrarAndar }) {
  if (cobertura.n_com_custo === 0) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
        <span style={{ ...TIPO.eyebrow, color: T.faint }}>onde o dinheiro foi</span>
        <p style={{ ...TIPO.meta, color: T.faint }}>
          Sem valor lançado em nenhum chamado fechado, não há como quebrar o custo por tipo nem por
          andar. O valor é preenchido pelo moderador ao fechar o chamado.
        </p>
      </section>
    );
  }

  const paraBarra = (d, rotular) => ({
    id: d.chave ?? d.rotulo,
    valor: d.total,
    texto: formatCost(d.total),
    rotulo: rotular(d.chave),
    rotuloCompleto: rotular(d.chave),
    // O `n` embaixo do valor: R$ 4.000 de um chamado e de quarenta são coisas
    // diferentes, e a barra sozinha diz que são iguais.
    sublinha: `${d.n_com_custo} de ${d.n} com valor`,
  });

  const tipos = custo.por_tipo.filter((d) => d.total > 0).map((d) => paraBarra(d, tipo));
  const andares = custo.por_andar
    .filter((d) => d.total > 0)
    .map((d) => ({ ...paraBarra(d, () => d.rotulo), chave: d.chave }));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.md }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint }}>onde o dinheiro foi</span>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: ESPACO.xl,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.xs, minWidth: 0 }}>
          <span style={{ ...TIPO.meta, color: T.mute }}>por tipo de manutenção</span>
          <Barras itens={tipos} medida="Custo" vazio="Nenhum tipo com valor lançado." />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.xs, minWidth: 0 }}>
          <span style={{ ...TIPO.meta, color: T.mute }}>por andar</span>
          <Barras
            itens={andares}
            medida="Custo"
            vazio="Nenhum andar com valor lançado."
            onSelecionar={onFiltrarAndar ? (i) => onFiltrarAndar(i.chave) : undefined}
          />
        </div>
      </div>

      {/* A categoria fica embaixo e em contagem, não em custo: com cinco
          valores e cobertura parcial, o custo por categoria diria mais sobre
          quem preencheu o campo do que sobre o prédio. */}
      <PorCategoria itens={custo.por_categoria} />
    </section>
  );
}

function PorCategoria({ itens }) {
  const total = itens.reduce((s, c) => s + c.n, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ ...TIPO.meta, color: T.mute }}>por categoria, em chamados</span>
      <span
        aria-hidden="true"
        style={{ display: 'flex', width: '100%', height: 10, borderRadius: 3, overflow: 'hidden' }}
      >
        {itens.map((c, i) => (
          <span
            key={c.chave}
            title={`${categoria(c.chave)}: ${c.n}`}
            style={{ width: `${(c.n / total) * 100}%`, background: CHART[i % CHART.length] }}
          />
        ))}
      </span>
      <div style={{ display: 'flex', gap: ESPACO.md, flexWrap: 'wrap' }}>
        {itens.map((c, i) => (
          <span
            key={c.chave}
            style={{
              ...TIPO.meta, color: T.faint,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8, height: 8, borderRadius: 2,
                background: CHART[i % CHART.length],
              }}
            />
            {categoria(c.chave)} {c.n}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * O que reincide: a matriz e a lista.
 *
 * A matriz mostra o padrão — uma coluna acesa é um tipo que reincide no prédio
 * todo, uma linha acesa é um andar que dá problema de tudo. A lista abaixo
 * nomeia os casos, com o custo acumulado e a data da última: "cinco vezes" e
 * "cinco vezes, a última em agosto" são informações diferentes, e a segunda diz
 * se ainda está acontecendo.
 */
function Reincidencia({ recorrencia }) {
  const celulas = recorrencia.celulas ?? [];

  if (celulas.length === 0) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.sm }}>
        <span style={{ ...TIPO.eyebrow, color: T.faint }}>o que reincide</span>
        <p style={{ ...TIPO.meta, color: T.faint }}>
          Nenhuma ocorrência aberta no período.
        </p>
      </section>
    );
  }

  // As linhas e colunas saem do que existe, e não do enum inteiro: uma grade de
  // vinte andares por treze tipos quase toda vazia não mostra padrão nenhum.
  const andares = [...new Map(celulas.map((c) => [c.floor_id, c.floor_label])).entries()].map(
    ([id, rotulo]) => ({ id: id ?? 'sem-andar', rotulo, rotuloCompleto: `Andar ${rotulo}` })
  );

  const tipos = [...new Set(celulas.map((c) => c.maintenance_type))].map((t) => ({
    id: t,
    rotulo: tipo(t).split(/[/ ]/)[0],
    rotuloCompleto: tipo(t),
  }));

  const mapa = new Map(
    celulas.map((c) => [`${c.floor_id ?? 'sem-andar'}|${c.maintenance_type}`, c])
  );

  const reincidentes = recorrencia.reincidentes ?? [];

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.md }}>
      <span style={{ ...TIPO.eyebrow, color: T.faint }}>o que reincide</span>

      <p style={{ ...TIPO.corpo, color: T.mute, lineHeight: 1.5 }}>
        {reincidentes.length === 0 ? (
          <>Nenhum andar repetiu o mesmo tipo de problema no período.</>
        ) : (
          <>
            <span style={{ color: T.text, fontWeight: W.title }}>
              {reincidentes.length}{' '}
              {reincidentes.length === 1 ? 'combinação repetiu' : 'combinações repetiram'}
            </span>{' '}
            no período — mesmo andar, mesmo tipo de manutenção. Remendo que volta é obra que não foi
            feita.
          </>
        )}
      </p>

      <Matriz
        linhas={andares}
        colunas={tipos}
        celula={(andarId, tipoId) => {
          const c = mapa.get(`${andarId}|${tipoId}`);
          return c ? { n: c.n, texto: String(c.n) } : null;
        }}
        medida="Ocorrências"
        vazio="Nenhuma ocorrência aberta no período."
      />

      {reincidentes.length > 0 && (
        <ul
          style={{
            listStyle: 'none', margin: 0, padding: 0,
            display: 'flex', flexDirection: 'column',
          }}
        >
          {reincidentes.map((r, i) => (
            <li
              key={`${r.floor_id}-${r.maintenance_type}`}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: ESPACO.md, padding: `${ESPACO.sm}px 0`,
                borderTop: i === 0 ? 'none' : `1px solid ${T.line}`,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ ...TIPO.corpo, color: T.text, display: 'block' }}>
                  Andar {r.floor_label} · {tipo(r.maintenance_type)}
                </span>
                <span style={{ ...TIPO.meta, color: T.faint, display: 'block' }}>
                  {r.n} vezes · da primeira em {String(r.primeira_em).slice(0, 10)} à última em{' '}
                  {String(r.ultima_em).slice(0, 10)}
                </span>
              </span>

              <span
                style={{
                  ...TIPO.meta, ...NUM, color: r.custo > 0 ? T.text : T.faint,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {r.custo > 0 ? formatCost(r.custo) : 'sem valor lançado'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
