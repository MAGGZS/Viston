'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { T, W, MOTION } from '@/app/lib/theme';
import { TIPO } from './escala';

/**
 * As visões do painel analítico, e por qual entrar.
 *
 * Abas com fio, e não a pílula dourada sobre trilho que estava aqui antes.
 *
 * A pílula é a peça certa em dois ou três botões curtos dentro de um cartão —
 * é o que o alternador de histórico e o seletor de fila do responsável fazem, e
 * lá ela continua. Aqui ela era outra coisa: este alternador é o primeiro
 * elemento da página, e a barra dourada atravessava a tela inteira antes de
 * qualquer número. Um bloco chapado de cor no topo é o que o olho vê primeiro,
 * e ele não carregava informação nenhuma — só dizia onde você já está.
 *
 * E a largura era acidente, não decisão: `inline-grid` deveria encolher até o
 * conteúdo, mas o pai é um flex em coluna e `align-items: stretch` é o padrão,
 * então o trilho esticava. Daí a faixa. `alignSelf: 'flex-start'` mora aqui
 * dentro agora — a peça se defende do pai em vez de depender de ele colaborar.
 *
 * O que ficou da versão anterior é o movimento: o fio **corre** de uma aba à
 * outra em vez de acender numa e apagar noutra. Acender e apagar são dois
 * eventos que quem olha tem de juntar; o deslize já diz que é o mesmo lugar que
 * mudou de lado. Mesma curva do resto do produto (`MOTION.slide`), para as
 * peças que se movem na tela chegarem juntas.
 *
 * **Por que medir o DOM agora.** A versão de pílula fixava colunas iguais
 * (`1fr`) para poder andar em porcentagem sem medir nada. Com fio, coluna igual
 * fica errada: o traço de "Prédio" teria a largura de "Desempenho" e sobraria
 * fio dos dois lados da palavra. O fio tem de ter a largura do texto, e isso
 * só se sabe medindo. O `ResizeObserver` cobre o que muda depois da primeira
 * medida — fonte que termina de carregar, janela que muda de tamanho.
 */

export function SeletorDeVisao({ views, value, onSelect, label, className = '' }) {
  const index = Math.max(0, views.findIndex((item) => item.key === value));

  const refs = useRef([]);
  const trilho = useRef(null);
  /** `medido` separa "ainda não sei onde o fio vai" de "vai no zero". */
  const [barra, setBarra] = useState({ left: 0, width: 0, medido: false });

  useLayoutEffect(() => {
    const alvo = refs.current[index];
    if (!alvo) return undefined;

    const medir = () => setBarra({ left: alvo.offsetLeft, width: alvo.offsetWidth, medido: true });
    medir();

    // Observa os dois: o botão muda com a fonte, o trilho muda com a janela.
    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    if (trilho.current) observador.observe(trilho.current);

    return () => observador.disconnect();
  }, [index, views.length]);

  return (
    <div
      ref={trilho}
      role="tablist"
      aria-label={label}
      className={className}
      style={{
        position: 'relative',
        alignSelf: 'flex-start', maxWidth: '100%',
        display: 'flex', gap: 4,
        // O fio fino sob a fileira inteira é o que faz as abas inativas
        // pousarem numa linha em vez de flutuarem soltas. Sem ele, o traço
        // dourado parece sublinhar uma palavra qualquer.
        boxShadow: `inset 0 -1px 0 ${T.line}`,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}
    >
      {views.map((item, i) => {
        const active = item.key === value;

        return (
          <button
            key={item.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.key)}
            className="btn"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '10px 14px 12px',
              fontFamily: T.display, fontSize: 13,
              // O peso não muda com a seleção: em 600 a palavra é mais larga
              // que em 400, e o fio teria de perseguir uma largura que muda no
              // meio da própria viagem. Quem diz qual está aberta é a cor.
              fontWeight: W.title,
              color: active ? T.text : T.mute,
              transition: 'color 160ms ease',
              whiteSpace: 'nowrap',
              // Arredondado só em cima: o pé da aba encosta no fio.
              borderRadius: '8px 8px 0 0',
            }}
          >
            {item.tab}
          </button>
        );
      })}

      {/* O fio que corre, por cima do fio fino do trilho. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: 0, left: 0, height: 2,
          width: barra.width,
          transform: `translateX(${barra.left}px)`,
          background: T.accent, borderRadius: '2px 2px 0 0',
          // Sem transição até a primeira medida, senão ele entra na tela
          // deslizando da esquerda e crescendo do zero a cada montagem.
          transition: barra.medido ? `${MOTION.slide}, width 260ms ${MOTION.slideEase}` : 'none',
          opacity: barra.medido ? 1 : 0,
        }}
      />
    </div>
  );
}

/**
 * O alternador de dentro de um bloco — o mesmo desenho, um degrau menor.
 *
 * Existe para a troca de equipe em `Desempenho`, que usava um segmented control
 * (`.seg`) com `aria-pressed`. Duas coisas erradas ali: `aria-pressed` anuncia
 * botão de alternância, e não aba, para quem ouve a tela; e uma pílula cinza
 * dentro de um cartão logo abaixo de abas com fio eram dois desenhos para a
 * mesma interação, na mesma tela, a 40px de distância.
 *
 * Menor que o de cima (11px, sem o fio de trilho) porque aqui já se está dentro
 * do assunto: o cartão, o título e as abas principais não se moveram, e só o
 * miolo muda.
 */
export function SeletorInterno({ views, value, onSelect, label }) {
  const index = Math.max(0, views.findIndex((item) => item.key === value));

  const refs = useRef([]);
  const [barra, setBarra] = useState({ left: 0, width: 0, medido: false });

  useLayoutEffect(() => {
    const alvo = refs.current[index];
    if (!alvo) return undefined;

    const medir = () => setBarra({ left: alvo.offsetLeft, width: alvo.offsetWidth, medido: true });
    medir();

    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [index, views.length]);

  return (
    <div
      role="tablist"
      aria-label={label}
      style={{ position: 'relative', display: 'inline-flex', gap: 2, alignSelf: 'flex-start' }}
    >
      {views.map((item, i) => {
        const active = item.key === value;

        return (
          <button
            key={item.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(item.key)}
            className="btn"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '4px 8px 7px',
              ...TIPO.meta, fontWeight: W.strong,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              color: active ? T.text : T.faint,
              transition: 'color 160ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            {item.rotulo ?? item.tab}
          </button>
        );
      })}

      <span
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: 0, left: 0, height: 2,
          width: barra.width,
          transform: `translateX(${barra.left}px)`,
          background: T.accent, borderRadius: '2px 2px 0 0',
          transition: barra.medido ? `${MOTION.slide}, width 260ms ${MOTION.slideEase}` : 'none',
          opacity: barra.medido ? 1 : 0,
        }}
      />
    </div>
  );
}
