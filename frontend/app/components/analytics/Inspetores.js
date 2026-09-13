'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/app/components/ui';
import { parseReportDate } from '@/app/lib/date';
import { T, W, NUM } from '@/app/lib/theme';
import { ESPACO, TIPO } from './escala';

/**
 * Quem vistoria o prédio, e com que rigor.
 *
 * O responsável é medido pelo que resolve; o inspetor, pelo que encontra. São
 * trabalhos diferentes e nenhuma coluna serve para os dois — por isso esta
 * tabela não é a de responsáveis com outros nomes.
 *
 * As três perguntas que ela responde, nesta ordem: **quem está rodando o
 * prédio** (vistorias, dias), **quanto do prédio cada um cobre** (andares, em
 * percentual do total), e **se alguém está passando rápido demais**
 * (ocorrências por vistoria, e quantas rondas terminaram sem achar nada).
 *
 * O último par é o que exige cuidado de redação. Zero ocorrência numa ronda ou
 * é prédio em ordem ou é ronda que não olhou, e a tela não tem como saber qual.
 * Então ela mostra o número e cala o julgamento: nenhuma coluna de inspetor
 * acende em vermelho. Quem decide é o gestor, que conhece o prédio.
 */

function numero(v, casas = 0) {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

const pct = (v) => (v === null || v === undefined ? '—' : `${numero(v)}%`);

/** O dia da última ronda, e há quanto tempo foi. */
function ultima(valor) {
  const data = parseReportDate(valor);
  if (!data) return '—';

  const hoje = new Date();
  const diff = Math.round((hoje - data) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return `há ${diff} dias`;
}

const COLUNAS = [
  { chave: 'name', titulo: 'Inspetor', tipo: 'texto' },
  { chave: 'vistorias', titulo: 'Vistorias', dica: 'Rondas concluídas no período.' },
  { chave: 'dias', titulo: 'Dias em campo', dica: 'Dias distintos com pelo menos uma ronda.' },
  { chave: 'cobertura', titulo: 'Cobertura', formato: pct, dica: 'Quantos andares do prédio a pessoa visitou, do total.' },
  { chave: 'ocorrencias', titulo: 'Ocorrências', dica: 'Total de ocorrências que as rondas dela abriram.' },
  { chave: 'por_vistoria', titulo: 'Por ronda', formato: (v) => numero(v, 1), dica: 'Média de ocorrências por vistoria. Baixo demais pode ser prédio em ordem ou ronda apressada.' },
  { chave: 'pct_sem_ocorrencia', titulo: 'Rondas sem achado', formato: pct, dica: 'Percentual de rondas que terminaram sem abrir nada.' },
  { chave: 'ultima', titulo: 'Última ronda', formato: ultima, tipo: 'data' },
];

function Cabecalho({ coluna, ordem, onOrdenar }) {
  const ativa = ordem.chave === coluna.chave;
  const alinhaDireita = coluna.tipo !== 'texto';

  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
      style={{ padding: 0, textAlign: alinhaDireita ? 'right' : 'left', whiteSpace: 'nowrap' }}
    >
      <button
        type="button"
        onClick={() => onOrdenar(coluna.chave)}
        title={coluna.dica}
        className="btn"
        style={{
          width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
          padding: `${ESPACO.sm}px ${ESPACO.md}px`, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', gap: ESPACO.xs,
          justifyContent: alinhaDireita ? 'flex-end' : 'flex-start',
          ...TIPO.cabecalho,
          color: ativa ? T.text : T.faint,
        }}
      >
        {coluna.titulo}
        {ativa &&
          (ordem.desc ? <ArrowDown size={11} aria-hidden="true" /> : <ArrowUp size={11} aria-hidden="true" />)}
      </button>
    </th>
  );
}

/** O resumo da equipe de vistoria, acima da tabela. */
function ResumoDaEquipe({ equipe, totalAndares, periodo }) {
  return (
    <div style={{ display: 'flex', gap: ESPACO.xl, flexWrap: 'wrap', alignItems: 'baseline' }}>
      <span style={{ ...TIPO.corpo, color: T.mute, ...NUM }}>
        <span style={{ color: T.text, fontWeight: W.title }}>{equipe.vistorias}</span>{' '}
        {equipe.vistorias === 1 ? 'ronda' : 'rondas'} por{' '}
        <span style={{ color: T.text, fontWeight: W.title }}>{equipe.pessoas}</span>{' '}
        {equipe.pessoas === 1 ? 'inspetor' : 'inspetores'} em {periodo?.label}
      </span>
      <span style={{ ...TIPO.corpo, color: T.mute, ...NUM }}>
        <span style={{ color: T.text, fontWeight: W.title }}>{numero(equipe.por_vistoria, 1)}</span>{' '}
        ocorrências por ronda, na média
      </span>
      <span style={{ ...TIPO.corpo, color: T.mute, ...NUM }}>
        prédio com <span style={{ color: T.text, fontWeight: W.title }}>{totalAndares}</span>{' '}
        {totalAndares === 1 ? 'andar' : 'andares'}
      </span>
    </div>
  );
}

export function Inspetores({ dados, loading }) {
  const [ordem, setOrdem] = useState({ chave: 'vistorias', desc: true });

  // Memorizada porque entra na dependência do `useMemo` abaixo: `?? []` cria um
  // array novo a cada render, e a ordenação recomeçaria sem nada ter mudado.
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);

  const ordenadas = useMemo(() => {
    const col = COLUNAS.find((c) => c.chave === ordem.chave);
    const sinal = ordem.desc ? -1 : 1;

    return [...linhas].sort((a, b) => {
      if (col?.tipo === 'texto') return sinal * String(a.name).localeCompare(String(b.name), 'pt-BR');
      if (col?.tipo === 'data') return sinal * String(a.ultima ?? '').localeCompare(String(b.ultima ?? ''));
      const va = a[ordem.chave];
      const vb = b[ordem.chave];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return sinal * (va - vb);
    });
  }, [linhas, ordem]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.md }}>
        <Skeleton style={{ height: 40 }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 44 }} />
        ))}
      </div>
    );
  }

  if (!dados) return null;

  if (linhas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.xs }}>
        <p style={{ ...TIPO.titulo, color: T.text }}>
          Nenhuma vistoria registrada em {dados.periodo?.label ?? 'no período'}.
        </p>
        <p style={{ ...TIPO.meta, color: T.mute }}>
          Andar sem ronda é risco que ninguém viu. Troque o período ou confira quem tem o papel de
          inspetor no prédio.
        </p>
      </div>
    );
  }

  function ordenar(chave) {
    setOrdem((atual) =>
      atual.chave === chave ? { chave, desc: !atual.desc } : { chave, desc: chave !== 'name' }
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESPACO.lg }}>
      <ResumoDaEquipe
        equipe={dados.equipe}
        totalAndares={dados.total_andares}
        periodo={dados.periodo}
      />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
          <caption className="so-leitor">Desempenho dos inspetores do prédio no período</caption>
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
                <th
                  scope="row"
                  style={{
                    padding: ESPACO.md, textAlign: 'left',
                    ...TIPO.corpo, fontWeight: W.title, color: T.text,
                  }}
                >
                  {r.name}
                </th>

                {COLUNAS.slice(1).map((c) => (
                  <td
                    key={c.chave}
                    style={{
                      padding: ESPACO.md, textAlign: 'right',
                      ...TIPO.corpo, color: T.mute, ...NUM,
                    }}
                  >
                    {c.formato ? c.formato(r[c.chave]) : numero(r[c.chave])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...TIPO.meta, color: T.faint }}>
        Nenhuma coluna aqui acende em vermelho de propósito. Uma ronda sem achado pode ser andar em
        ordem ou ronda apressada, e a diferença entre as duas não está no banco — está no prédio, que
        é o que você conhece.
      </p>
    </div>
  );
}
