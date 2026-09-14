'use client';
import { T, W, HEAT } from '@/app/lib/theme';
import { TIPO } from './escala';
import { GraficoVazio } from './PoucosDados';

/**
 * A matriz de reincidência: andar por tipo de manutenção.
 *
 * É a peça que muda o assunto do painel. Todos os outros gráficos falam do
 * processo — quanto demora, onde trava, quem executa — e nenhum fala do prédio.
 * "Fechamos quarenta chamados" é uma frase sobre a equipe; "o sétimo andar teve
 * infiltração cinco vezes em seis meses" é uma frase sobre o prédio, e é a que
 * decide parar de remendar e fazer a obra.
 *
 * A pergunta é cruzada por natureza — nem a lista de andares nem a de tipos
 * responde sozinha —, e cruzamento de duas categorias se lê em grade. Uma lista
 * ordenada por reincidência daria a mesma informação numa ordem só; a grade
 * mostra o padrão: uma coluna inteira acesa é um tipo que reincide no prédio
 * todo, uma linha acesa é um andar que dá problema de tudo.
 *
 * A rampa é a `HEAT` do calendário de atividade, e de propósito: o produto já
 * tem uma escala ordinal validada nos dois temas, e inventar uma segunda faria
 * a mesma intensidade querer dizer coisas diferentes em duas telas.
 *
 * Regras que a peça garante sozinha:
 *
 * - **A intensidade é relativa ao maior da grade**, e a legenda diz qual é.
 *   Sem isso, "escuro" não tem tamanho.
 * - **A célula vazia é vazia**, e não o degrau mais claro: zero ocorrência e
 *   uma ocorrência são coisas diferentes, e a rampa não pode empatá-las.
 * - **Nada é dito só por cor.** Cada célula carrega o número, e existe tabela.
 */

/** O piso da célula, para a grade não desmontar em telas estreitas. */
const CELULA = 30;

/** A largura da coluna de rótulos de linha. */
const ROTULO = 92;

export function Matriz({
  /** `[{ id, rotulo, rotuloCompleto }]` — as linhas, tipicamente os andares. */
  linhas,
  /** `[{ id, rotulo, rotuloCompleto }]` — as colunas, tipicamente os tipos. */
  colunas,
  /** `(linhaId, colunaId) => { n, texto } | null` */
  celula,
  medida = 'Ocorrências',
  onSelecionar,
  vazio = 'Nada registrado neste recorte.',
}) {
  const valores = [];
  for (const l of linhas) {
    for (const c of colunas) {
      const v = celula(l.id, c.id);
      if (v && v.n > 0) valores.push(v.n);
    }
  }

  if (valores.length === 0) {
    return <GraficoVazio>{vazio}</GraficoVazio>;
  }

  const teto = Math.max(...valores);

  /**
   * O degrau da rampa para uma contagem, como índice de `HEAT`.
   *
   * `HEAT[0]` é a cor do chip — o fundo —, e fica reservado ao vazio. O que tem
   * ocorrência começa em `HEAT[1]`, para uma única ocorrência nunca se
   * confundir com nenhuma.
   */
  const degrau = (n) => {
    if (!n) return 0;
    if (teto === 1) return 2;
    return Math.min(Math.max(Math.ceil((n / teto) * 4), 1), 4);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      {/* A grade rola no próprio eixo, e não empurra a página.
          Treze tipos não cabem em 375px, e a alternativa — encolher a célula
          até caber — daria quadrados de 12px que não se clicam nem se leem. */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateColumns: `${ROTULO}px repeat(${colunas.length}, minmax(${CELULA}px, 1fr))`,
            gap: 2, minWidth: ROTULO + colunas.length * (CELULA + 2),
          }}
        >
          {/* O canto vazio do cabeçalho. */}
          <span />

          {colunas.map((coluna) => (
            <span
              key={coluna.id}
              title={coluna.rotuloCompleto ?? coluna.rotulo}
              style={{
                ...TIPO.meta, color: T.faint, lineHeight: 1.2,
                textAlign: 'center', paddingBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {coluna.rotulo}
            </span>
          ))}

          {linhas.map((linha) => (
            <Fileira
              key={linha.id}
              linha={linha}
              colunas={colunas}
              celula={celula}
              degrau={degrau}
              onSelecionar={onSelecionar}
            />
          ))}
        </div>
      </div>

      {/* A legenda da rampa. Sem ela "escuro" não tem tamanho — e o que faz a
          grade dizer alguma coisa é saber que o mais escuro é cinco, e não
          cinquenta. */}
      <span
        style={{
          color: T.faint, fontSize: 10,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        nenhuma
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            style={{ width: 12, height: 12, borderRadius: 3, background: HEAT[i] }}
          />
        ))}
        {`${teto} ${teto === 1 ? 'ocorrência' : 'ocorrências'}`}
      </span>

      <div className="so-leitor">
        <table>
          <caption>{medida} por andar e tipo de manutenção</caption>
          <tbody>
            <tr>
              <th scope="col">Andar</th>
              {colunas.map((c) => (
                <th key={c.id} scope="col">{c.rotuloCompleto ?? c.rotulo}</th>
              ))}
            </tr>
            {linhas.map((linha) => (
              <tr key={linha.id}>
                <th scope="row">{linha.rotuloCompleto ?? linha.rotulo}</th>
                {colunas.map((coluna) => {
                  const v = celula(linha.id, coluna.id);
                  return <td key={coluna.id}>{v?.n ? v.texto ?? String(v.n) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Uma linha da grade.
 *
 * Componente à parte só para o `key` do React cair no lugar certo: uma grade em
 * CSS não aninha elementos por linha, então o rótulo e as células são irmãos, e
 * um fragmento com `key` é o que mantém a reconciliação estável quando a lista
 * de andares muda com o filtro.
 */
function Fileira({ linha, colunas, celula, degrau, onSelecionar }) {
  return (
    <>
      <span
        title={linha.rotuloCompleto ?? linha.rotulo}
        style={{
          color: T.mute, fontSize: 10, lineHeight: `${CELULA}px`,
          paddingRight: 6, textAlign: 'right',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {linha.rotulo}
      </span>

      {colunas.map((coluna) => {
        const v = celula(linha.id, coluna.id);
        const n = v?.n ?? 0;
        const nivel = degrau(n);
        const clicavel = Boolean(onSelecionar) && n > 0;
        const Celula = clicavel ? 'button' : 'span';

        return (
          <Celula
            key={coluna.id}
            type={clicavel ? 'button' : undefined}
            onClick={clicavel ? () => onSelecionar(linha, coluna, v) : undefined}
            title={`${linha.rotuloCompleto ?? linha.rotulo} · ${coluna.rotuloCompleto ?? coluna.rotulo}: ${n}`}
            style={{
              height: CELULA, borderRadius: 3,
              background: HEAT[nivel],
              border: 'none', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: clicavel ? 'pointer' : 'default',
              /* O número dentro da célula, e não só a cor: quem não distingue
                 os degraus da rampa continua lendo a grade inteira. A partir de
                 dois, porque um "1" repetido em trinta células vira textura.
                 Nos dois degraus mais fortes a rampa satura e o texto vira
                 preto — é o mesmo par `accent`/`onAccent` do resto do produto. */
              color: nivel >= 3 ? T.onAccent : T.mute,
              fontSize: 10, fontWeight: W.strong,
              transition: 'background 200ms var(--ease-saida)',
            }}
          >
            {n > 1 ? n : ''}
          </Celula>
        );
      })}
    </>
  );
}
