'use client';
import { T, W, MOTION } from '@/app/lib/theme';

/**
 * As visões do painel analítico, e por qual entrar.
 *
 * Mesma peça do alternador de histórico do painel inicial (ver
 * `HistoricoSwitcher`) e do seletor de fila do responsável: pílula sobre
 * trilho, a ativa em dourado, e o dourado é uma peça só que corre de um botão
 * ao outro em vez de acender num e apagar no outro — acender e apagar são dois
 * eventos que quem olha tem de juntar; o movimento já diz que é o mesmo lugar
 * que mudou de lado.
 *
 * Escrita aqui em vez de reaproveitar o alternador do histórico porque aquele
 * é fechado nas duas visões dele (`HISTORICO_VIEWS`) e tem teste próprio.
 * Generalizá-lo é a mudança certa, mas mexer em código coberto por teste sem
 * conseguir rodar o teste não é — a suíte do frontend não sobe nesta máquina
 * (falta o VC++ Redistributable). Fica a dívida anotada: quando a suíte voltar,
 * as duas peças viram uma.
 *
 * Duas decisões que o movimento cobra:
 *
 * - As colunas são iguais (`grid-auto-columns: 1fr`), e não do tamanho de cada
 *   palavra. É o que permite a pílula andar por porcentagem, sem medir o DOM.
 * - O peso da fonte não muda com a seleção: em 600 a palavra é mais larga que
 *   em 400, e o trilho inteiro mudaria de largura no meio da viagem. Quem diz
 *   qual está aberta é a cor.
 */

/** O trilho tem 4px de folga de cada lado; a pílula que corre ocupa o resto. */
const TRACK_PAD = 4;

export function SeletorDeVisao({ views, value, onSelect, label }) {
  const index = Math.max(0, views.findIndex((item) => item.key === value));

  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        position: 'relative', maxWidth: '100%',
        display: 'inline-grid', gridAutoFlow: 'column', gridAutoColumns: '1fr',
        background: T.chip, borderRadius: 999, padding: TRACK_PAD,
      }}
    >
      {/* A pílula fica atrás dos rótulos, e não dentro do botão ativo: dentro
          dele, ela nasceria e morreria a cada troca, e o que se veria seria um
          piscar. As medidas saem de porcentagem do próprio trilho. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: TRACK_PAD, bottom: TRACK_PAD, left: TRACK_PAD,
          width: `calc((100% - ${TRACK_PAD * 2}px) / ${views.length})`,
          transform: `translateX(${index * 100}%)`,
          background: T.accent, borderRadius: 999,
          transition: MOTION.slide,
        }}
      />

      {views.map((item) => {
        const active = item.key === value;

        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.key)}
            style={{
              // `relative` põe o rótulo acima da pílula sem tirá-lo do grid: é o
              // empilhamento que faz o dourado passar por baixo do texto.
              position: 'relative',
              border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 999,
              padding: '9px 14px', fontFamily: T.display, fontSize: 13, fontWeight: W.title,
              color: active ? T.onAccent : T.mute,
              // A cor troca em metade da viagem: a palavra escurece quando o
              // dourado já está debaixo dela, não antes de ele chegar.
              transition: 'color 130ms ease 90ms',
              whiteSpace: 'nowrap',
            }}
          >
            {item.tab}
          </button>
        );
      })}
    </div>
  );
}
