'use client';
import { T, W } from '@/app/lib/theme';

/**
 * O que o painel diz quando o número não sustenta a leitura.
 *
 * Um percentual sem denominador é uma afirmação sem sujeito. "50% dentro do
 * prazo" sobre dois chamados fechados e "50%" sobre duzentos são a mesma
 * tipografia e coisas diferentes — e o primeiro, pintado de vermelho ao lado de
 * uma variação de "-30 pp", é ruído desenhado como sinal. Foi assim que o painel
 * passou a dizer que a equipe piorou porque um chamado a mais atrasou.
 *
 * A peça não esconde o número: esconder seria outra mentira, a de que não há
 * dado. Ela mostra o valor sem peso — cinza, sem alerta, sem seta de variação —
 * e escreve sobre quantos chamados ele fala. Quem lê decide se aquilo basta.
 *
 * O piso vem do servidor (`kpis.amostra.minimo`), e não de uma constante
 * repetida aqui: é o mesmo número que decide o que o backend considera
 * confiável, e duas cópias dele é como as duas metades do produto passam a
 * discordar sobre o que é pouco.
 */

/** O `n` sustenta uma leitura com peso de sinal. */
export function confiavel(n, minimo) {
  return typeof n === 'number' && typeof minimo === 'number' && n >= minimo;
}

/**
 * A frase que acompanha um número de amostra curta.
 *
 * Vai junto do valor, e não no rodapé do cartão: a ressalva que mora longe do
 * número não é lida junto com ele.
 */
export function Ressalva({ n, unidade = 'chamado', unidadePlural = 'chamados', style = {} }) {
  if (typeof n !== 'number') return null;

  return (
    <span
      style={{
        color: T.faint, fontSize: 10, fontWeight: W.body,
        display: 'block', lineHeight: 1.4, ...style,
      }}
    >
      {n === 0
        ? 'nenhum chamado no recorte'
        : `sobre ${n} ${n === 1 ? unidade : unidadePlural} — poucos para tirar conclusão`}
    </span>
  );
}

/**
 * O bloco inteiro sem dado suficiente.
 *
 * Para quando nem o número existe — período vazio, prédio novo, filtro que não
 * casou com nada. Diz o que falta, e não "sem dados": quem lê precisa saber se
 * mexe no filtro ou se o prédio é que está quieto.
 */
export function PoucosDados({ children = 'Sem dados neste recorte.', dica, style = {} }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '12px 0', ...style,
      }}
    >
      <span style={{ color: T.mute, fontSize: 12, lineHeight: 1.4 }}>{children}</span>
      {dica && <span style={{ color: T.faint, fontSize: 10, lineHeight: 1.4 }}>{dica}</span>}
    </div>
  );
}
