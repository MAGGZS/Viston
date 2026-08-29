'use client';
import { Select } from '@/app/components/ui';
import { T, R } from '@/app/lib/theme';

/**
 * O chip de filtro — a peça que as fileiras de recorte do produto usam.
 *
 * É a mesma forma do "Compartilhar ID" do painel do gestor, um ponto menor:
 * fundo de chip, canto de controle, texto de 13 e o nome do campo apagado
 * enquanto ninguém escolheu nada. Uma fileira de sete peças é muita tinta se
 * cada uma tem o tamanho de um botão de ação, e nenhuma delas é a ação da tela.
 *
 * Mora fora de quem o usa porque já são duas fileiras — a dos finalizados e a
 * dos gráficos do painel —, e duas cópias bastariam para elas começarem a
 * divergir num pixel de cada vez.
 */

/**
 * A medida do chip.
 *
 * Ele se mede pelo que carrega, entre um piso e um teto. Largura fixa obrigava
 * a peça a caber "Todos os responsáveis" — a fileira inteira ficava do tamanho
 * do rótulo mais comprido, que é justamente o que ninguém está lendo. O piso
 * segura o vaivém quando se troca um valor curto por outro; o teto manda
 * "Higienização/Limpeza" terminar em reticências em vez de empurrar a fila.
 */
export const CHIP_MIN_W = 108;
export const CHIP_MAX_W = 190;

/**
 * A altura é a mesma nos três tipos de chip, e não sai de graça.
 *
 * O gatilho do `Select` mede 29px sozinho — é o que o recuo de 6px e uma linha
 * de 13px dão. Os outros não: o `<label>` do período e os botões nascem com a
 * entrelinha `normal` da fonte, que em Poppins é maior, e a fileira ficava com
 * peças de 34px ao lado de peças de 29. Medido no navegador; 17px é a linha que
 * as iguala. No gatilho ele não vai — lá *aumentaria* a peça para 31.
 */
export const chipBase = {
  display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  background: T.chip, borderRadius: R.control, fontSize: 13, lineHeight: '17px',
};

/** O recuo do chip. À direita cabe a seta do `Select`, que mora a 12px da borda. */
export const CHIP_PAD = '6px 12px';
export const CHIP_PAD_SETA = '6px 30px 6px 12px';

/**
 * "Não filtrar por isto" precisa ser uma opção com valor próprio.
 *
 * Se ela valesse `''` — o vazio do filtro —, o gatilho a encontraria na lista e
 * mostraria "Todos os andares" o tempo todo, e cada chip nasceria do tamanho
 * dessa frase. Com um valor que nenhuma opção usa, o vazio não casa com nada e
 * o gatilho cai no `placeholder`: o nome do campo, curto e apagado, como no
 * botão de compartilhar. A lista continua dizendo a frase inteira, que é onde
 * ela é útil.
 */
export const CHIP_TODOS = '__todos';

/**
 * Uma droplist em forma de chip.
 *
 * `todos` é o rótulo da opção que desliga o filtro. Ela existe quando não
 * escolher nada é o mesmo que não filtrar — o gatilho então cai no nome do
 * campo. Onde o vazio tem significado próprio ("Até hoje", no período), a opção
 * entra direto em `options` com valor `''`: aí ela é escolha, não ausência, e
 * precisa aparecer no gatilho.
 *
 * `ativo` diz quando o chip acende. O padrão — ter algum valor — serve à
 * maioria; quem tem um valor padrão que não é o vazio (o ano corrente) passa o
 * seu, senão o chip nasce aceso e o dourado deixa de querer dizer "afunilei".
 */
export function ChipSelect({ label, todos, options, value, onChange, minWidth = CHIP_MIN_W, ativo }) {
  const aceso = ativo ?? (value !== '' && value != null);
  const comTodos = todos ? [{ value: CHIP_TODOS, label: todos }, ...options] : options;

  return (
    <Select
      options={comTodos}
      value={value}
      onChange={(e) => onChange(e.target.value === CHIP_TODOS ? '' : e.target.value)}
      placeholder={label}
      aria-label={label}
      wrapperStyle={{ minWidth, maxWidth: CHIP_MAX_W, flexShrink: 0 }}
      // O fundo só é escrito quando o recorte vale: inline ele vence a folha de
      // estilo do `.select-trigger`, e escrevê-lo sempre custaria o realce do
      // cursor que mora lá.
      style={{
        padding: CHIP_PAD_SETA, fontSize: 13,
        ...(aceso ? { background: T.accentSoft } : {}),
      }}
    />
  );
}
