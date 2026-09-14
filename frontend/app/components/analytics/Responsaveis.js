'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Clock } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { labelOf, MAINTENANCE_TYPES } from '@/app/lib/maintenanceOptions';
import { T, R, W, NUM, CHART } from '@/app/lib/theme';

/**
 * Os responsáveis do prédio — comparados, ou um só por inteiro.
 *
 * Os dois modos não são duas telas: são a mesma visão com o filtro de
 * responsável ligado ou desligado. Com "Todos", o que se quer é comparar, e
 * comparar é pôr as mesmas colunas lado a lado — abrir a análise completa de
 * oito pessoas seria oito telas empilhadas, e ninguém compara rolando. Com uma
 * pessoa escolhida, o que se quer é entender aquela pessoa, e aí a tabela de um
 * único registro seria uma tabela sem comparação nenhuma.
 *
 * No modo individual todo número aparece ao lado da média da equipe. "7,2 dias"
 * não é elogio nem crítica até se saber que a equipe faz em 5.
 */

function numero(v, casas = 0) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const pct = (v) => (v === null || v === undefined ? '—' : `${numero(v)}%`);
const dias = (v) => (v === null || v === undefined ? '—' : `${numero(v, 1)} d`);

/**
 * As colunas da tabela.
 *
 * `bomAlto` diz de que lado está a boa notícia — é o que permite pintar de
 * vermelho a taxa de atraso e não pintar o número de concluídos, sem uma lista
 * de exceções espalhada pelo desenho.
 */
const COLUNAS = [
  { chave: 'name', titulo: 'Responsável', tipo: 'texto' },
  { chave: 'recebidos', titulo: 'Recebidos', dica: 'Chamados que a pessoa aceitou dentro do período.' },
  { chave: 'concluidos', titulo: 'Concluídos', dica: 'Chamados fechados pelo moderador dentro do período.' },
  { chave: 'em_andamento_agora', titulo: 'Na mão agora', dica: 'Recebidos e ainda não fechados, neste instante.' },
  {
    chave: 'carga',
    titulo: 'Carga',
    tipo: 'carga',
    dica: 'De que o trabalho concluído é feito: quanto de alta, média e baixa prioridade.',
  },
  { chave: 'tempo_medio', titulo: 'Tempo médio', formato: dias, bomAlto: false, dica: 'Dias úteis entre a vistoria e o fechamento.' },
  { chave: 'taxa_atraso', titulo: 'Atraso', formato: pct, bomAlto: false, alertaAcima: 0, dica: 'Dos concluídos, quantos saíram fora do prazo.' },
  { chave: 'pct_sla', titulo: 'SLA', formato: pct, bomAlto: true, dica: 'Dos concluídos, quantos saíram dentro do prazo.' },
];

/** A ordem das prioridades na micro-barra, da mais urgente para a menos. */
const CARGA = [
  { chave: 'ALTA', rotulo: 'alta', cor: 0 },
  { chave: 'MEDIA', rotulo: 'média', cor: 2 },
  { chave: 'BAIXA', rotulo: 'baixa', cor: 4 },
];

/**
 * De que a carga da pessoa é feita.
 *
 * A tabela existia para comparar gente, e comparava taxa de atraso entre quem
 * não recebeu o mesmo trabalho: prioridade alta tem cinco dias úteis de prazo,
 * baixa tem quinze. Quem pega as altas aparece pior fazendo o serviço mais
 * difícil — e o painel pintava isso de vermelho sem dizer nada a respeito.
 *
 * Uma micro-barra empilhada, na rampa `CHART`, que já é ordinal: o degrau mais
 * escuro é a prioridade mais alta, e a ordem se lê na própria cor. Não é um
 * gráfico a mais na tela, é a legenda que faltava às outras duas colunas.
 */
function Carga({ carga }) {
  const total = CARGA.reduce((s, p) => s + (carga?.[p.chave] ?? 0), 0);

  if (!carga || total === 0) {
    return <span style={{ color: T.faint, fontSize: 12 }}>—</span>;
  }

  const texto = CARGA.filter((p) => carga[p.chave] > 0)
    .map((p) => `${carga[p.chave]} ${p.rotulo}`)
    .join(', ');

  return (
    <span
      title={texto}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'flex', width: 46, height: 8, borderRadius: 2, overflow: 'hidden' }}
      >
        {CARGA.map((p) => {
          const n = carga[p.chave] ?? 0;
          if (n === 0) return null;
          return (
            <span
              key={p.chave}
              style={{ width: `${(n / total) * 100}%`, background: CHART[p.cor] }}
            />
          );
        })}
      </span>
      {/* O texto ao lado da barra, e não só no `title`: uma barra de 46px com
          três fatias não se lê, e a coluna existe justamente para desfazer um
          julgamento — não pode depender de passar o mouse. */}
      <span style={{ color: T.faint, fontSize: 11, whiteSpace: 'nowrap', ...NUM }}>{texto}</span>
    </span>
  );
}

/** O cabeçalho que ordena. Clicável, e anunciado como tal. */
function Cabecalho({ coluna, ordem, onOrdenar }) {
  const ativa = ordem.chave === coluna.chave;
  const numerica = coluna.tipo !== 'texto';

  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
      style={{ padding: 0, textAlign: numerica ? 'right' : 'left', whiteSpace: 'nowrap' }}
    >
      <button
        type="button"
        onClick={() => onOrdenar(coluna.chave)}
        title={coluna.dica}
        className="btn"
        style={{
          width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
          padding: '8px 10px', borderRadius: R.badge,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          justifyContent: numerica ? 'flex-end' : 'flex-start',
          color: ativa ? T.text : T.faint, fontSize: 10, fontWeight: W.strong,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {coluna.titulo}
        {/* A seta só na coluna ordenada: uma seta apagada em cada cabeçalho
            enche a linha de ruído para dizer "aqui dá para clicar", que o
            cursor e o foco já dizem. */}
        {ativa &&
          (ordem.desc ? (
            <ArrowDown size={11} aria-hidden="true" />
          ) : (
            <ArrowUp size={11} aria-hidden="true" />
          ))}
      </button>
    </th>
  );
}

function TabelaComparativa({ linhas, onAbrirPessoa }) {
  // Começa pelo que mais pede atenção: quem tem mais na mão agora.
  const [ordem, setOrdem] = useState({ chave: 'em_andamento_agora', desc: true });

  const ordenadas = useMemo(() => {
    const col = COLUNAS.find((c) => c.chave === ordem.chave);
    const sinal = ordem.desc ? -1 : 1;

    return [...linhas].sort((a, b) => {
      if (col?.tipo === 'texto') return sinal * String(a.name).localeCompare(String(b.name), 'pt-BR');
      // A carga não é um número: ordena pelo total concluído, que é o tamanho
      // dela. Ordenar pelo objeto daria `NaN` e embaralharia a tabela.
      if (col?.tipo === 'carga') return sinal * (a.concluidos - b.concluidos);
      // Sem dado vai sempre para o fim, ordene-se como se ordenar: quem não
      // concluiu nada não é "o mais rápido da equipe".
      const va = a[ordem.chave];
      const vb = b[ordem.chave];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return sinal * (va - vb);
    });
  }, [linhas, ordem]);

  function ordenar(chave) {
    setOrdem((atual) =>
      atual.chave === chave ? { chave, desc: !atual.desc } : { chave, desc: chave !== 'name' }
    );
  }

  return (
    // Rolagem horizontal contida: sete colunas não cabem no telefone, e o corpo
    // da página não pode rolar de lado por causa disso.
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse' }}>
        <caption className="so-leitor">
          Comparativo dos responsáveis do prédio no período
        </caption>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {COLUNAS.map((c) => (
              <Cabecalho key={c.chave} coluna={c} ordem={ordem} onOrdenar={ordenar} />
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((r) => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
              <th scope="row" style={{ padding: '10px', textAlign: 'left', fontWeight: W.body }}>
                <button
                  type="button"
                  onClick={() => onAbrirPessoa?.(r.id)}
                  className="btn"
                  style={{
                    border: 'none', background: 'transparent', padding: 0,
                    cursor: onAbrirPessoa ? 'pointer' : 'default',
                    color: T.text, fontSize: 13, fontWeight: W.title,
                    textAlign: 'left', textDecoration: onAbrirPessoa ? 'underline' : 'none',
                    textUnderlineOffset: 3, textDecorationColor: T.line,
                  }}
                >
                  {r.name}
                </button>
              </th>

              {COLUNAS.slice(1).map((c) => {
                const valor = r[c.chave];
                /**
                 * O vermelho pede duas coisas: valor ruim e amostra que baste.
                 *
                 * `r.confiavel` vem do servidor e é o mesmo piso que o resto do
                 * painel usa. Sem ele, "1 de 2 atrasou" acendia 50% em vermelho
                 * ao lado de quem fechou duzentos — e a pessoa que concluiu dois
                 * chamados aparecia como o pior problema da equipe. Abaixo do
                 * piso o número continua na tela, na tinta de sempre: esconder
                 * seria a outra mentira.
                 */
                const ruim =
                  c.alertaAcima !== undefined &&
                  valor !== null &&
                  valor > c.alertaAcima &&
                  r.confiavel !== false;

                return (
                  <td
                    key={c.chave}
                    style={{
                      padding: '10px', textAlign: 'right', fontSize: 13,
                      color: ruim ? T.danger : T.mute,
                      fontWeight: ruim ? W.strong : W.body,
                      ...NUM,
                    }}
                  >
                    {c.tipo === 'carga' ? (
                      <Carga carga={valor} />
                    ) : c.formato ? (
                      c.formato(valor)
                    ) : (
                      numero(valor)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Um número da pessoa, com o da equipe logo abaixo para comparar.
 *
 * As duas casas decimais são separadas de propósito: "concluiu 9" é contagem e
 * não tem meio chamado, mas "a equipe concluiu 5,3 por pessoa" é média e o
 * decimal é a informação. Uma casa só para os dois dava "9,0", que finge
 * precisão que a contagem não tem.
 */
function ContraAEquipe({ rotulo, valor, equipe, bomAlto, sufixo = '', casas = 0, casasEquipe = casas }) {
  const temAmbos = valor !== null && valor !== undefined && equipe !== null && equipe !== undefined;
  const diferenca = temAmbos ? valor - equipe : null;
  const pior = diferenca !== null && Math.abs(diferenca) > 0.05 && diferenca > 0 !== bomAlto;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span
        style={{
          color: T.faint, fontSize: 10, fontWeight: W.strong,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {rotulo}
      </span>
      <span
        style={{
          fontFamily: T.display, fontSize: 24, fontWeight: W.title, lineHeight: 1.1,
          color: pior ? T.danger : T.text,
        }}
      >
        {valor === null || valor === undefined ? '—' : `${numero(valor, casas)}${sufixo}`}
      </span>
      <span style={{ color: T.faint, fontSize: 11 }}>
        {equipe === null || equipe === undefined
          ? 'sem média de equipe'
          : `equipe: ${numero(equipe, casasEquipe)}${sufixo}`}
      </span>
    </div>
  );
}

function AnaliseIndividual({ pessoa, equipe, atrasados, periodo, onVoltar }) {
  if (!pessoa) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
          Esta pessoa não teve nenhum chamado em {periodo?.label ?? 'no período'}.
        </p>
        <p style={{ color: T.mute, fontSize: 12 }}>
          O vínculo com o prédio existe — o que não há é trabalho dela neste recorte. Troque o
          período ou volte para a comparação da equipe.
        </p>
        {onVoltar && <VoltarParaEquipe onVoltar={onVoltar} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={{ color: T.text, fontSize: 18, fontWeight: W.title }}>{pessoa.name}</h3>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 2 }}>
          {periodo?.label} · comparado com a média dos {equipe?.pessoas ?? 0}{' '}
          {equipe?.pessoas === 1 ? 'responsável do prédio' : 'responsáveis do prédio'}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
          gap: 16,
        }}
      >
        <ContraAEquipe
          rotulo="Concluídos"
          valor={pessoa.concluidos}
          equipe={equipe?.concluidos_por_pessoa}
          bomAlto
          casasEquipe={1}
        />
        <ContraAEquipe
          rotulo="Tempo médio"
          valor={pessoa.tempo_medio}
          equipe={equipe?.tempo_medio}
          bomAlto={false}
          sufixo=" d"
          casas={1}
        />
        <ContraAEquipe
          rotulo="SLA cumprido"
          valor={pessoa.pct_sla}
          equipe={equipe?.pct_sla}
          bomAlto
          sufixo="%"
        />
      </div>

      <div
        style={{
          borderTop: `1px solid ${T.line}`, paddingTop: 14,
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}
      >
        <span style={{ color: T.mute, fontSize: 12, ...NUM }}>
          <span style={{ color: T.text, fontWeight: W.title }}>{pessoa.recebidos}</span> recebidos
          no período
        </span>
        <span style={{ color: T.mute, fontSize: 12, ...NUM }}>
          <span style={{ color: T.text, fontWeight: W.title }}>{pessoa.em_andamento_agora}</span> na
          mão agora
        </span>
        {pessoa.custo !== null && pessoa.custo !== undefined && (
          <span style={{ color: T.mute, fontSize: 12, ...NUM }}>
            <span style={{ color: T.text, fontWeight: W.title }}>
              {pessoa.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>{' '}
            em manutenção
          </span>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
        <p
          style={{
            color: T.faint, fontSize: 10, fontWeight: W.strong,
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8,
          }}
        >
          Atrasados na mão dela agora
        </p>

        {atrasados.length === 0 ? (
          <p style={{ color: T.faint, fontSize: 12 }}>
            Nenhum chamado dela passou do prazo. Nada a cobrar hoje.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {atrasados.map((t) => (
              <li
                key={t.id}
                style={{
                  background: T.chip, borderRadius: R.control, padding: '8px 10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      color: T.text, fontSize: 12, fontWeight: W.title, display: 'block',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {labelOf(MAINTENANCE_TYPES, t.maintenance_type)}
                  </span>
                  <span style={{ color: T.faint, fontSize: 11 }}>{t.floor_label ?? 'Sem andar'}</span>
                </span>

                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    color: T.danger, fontSize: 11, fontWeight: W.strong, ...NUM,
                  }}
                >
                  <AlertTriangle size={11} aria-hidden="true" />
                  {t.dias - t.limite} {t.dias - t.limite === 1 ? 'dia' : 'dias'} além do prazo
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onVoltar && <VoltarParaEquipe onVoltar={onVoltar} />}
    </div>
  );
}

function VoltarParaEquipe({ onVoltar }) {
  return (
    <button
      type="button"
      onClick={onVoltar}
      className="btn"
      style={{
        alignSelf: 'flex-start', border: 'none', background: T.chip, cursor: 'pointer',
        borderRadius: R.control, padding: '7px 12px',
        color: T.mute, fontSize: 12, fontWeight: W.strong,
      }}
    >
      Voltar para a equipe
    </button>
  );
}

export function Responsaveis({ dados, loading, onSelecionar }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton style={{ height: 40 }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 44 }} />
        ))}
      </div>
    );
  }

  if (!dados) return null;

  if (dados.modo === 'INDIVIDUAL') {
    return (
      <AnaliseIndividual
        pessoa={dados.pessoa}
        equipe={dados.equipe}
        atrasados={dados.atrasados ?? []}
        periodo={dados.periodo}
        onVoltar={onSelecionar ? () => onSelecionar('') : undefined}
      />
    );
  }

  const linhas = dados.linhas ?? [];

  if (linhas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ color: T.text, fontSize: 14, fontWeight: W.title }}>
          Nenhum responsável recebeu chamado em {dados.periodo?.label ?? 'no período'}.
        </p>
        <p style={{ color: T.mute, fontSize: 12 }}>
          Ou não houve o que encaminhar, ou o que foi aberto ainda está na triagem do moderador.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TabelaComparativa linhas={linhas} onAbrirPessoa={onSelecionar} />
      <p style={{ color: T.faint, fontSize: 10, lineHeight: 1.5 }}>
        <Clock size={10} aria-hidden="true" style={{ verticalAlign: -1, marginRight: 4 }} />
        Recebidos, concluídos, tempo médio, atraso e SLA são do período escolhido.{' '}
        <span style={{ color: T.mute, fontWeight: W.strong }}>Na mão agora</span> é deste instante.
        Clique num nome para a análise completa da pessoa.
      </p>
    </div>
  );
}
