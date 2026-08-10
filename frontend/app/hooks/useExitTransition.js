'use client';
import { useEffect, useState } from 'react';

/** Precisa bater com .anim-fade-out / .anim-scale-out em globals.css. */
export const MODAL_EXIT_MS = 180;

/**
 * Mantém o elemento montado enquanto a animação de saída roda.
 *
 * Sem isso o `open` falso desmonta na hora e não sobra nada para animar: a
 * caixa some num quadro. Aqui `mounted` continua verdadeiro até a animação
 * acabar, e `closing` diz para o componente trocar a classe de entrada pela
 * de saída.
 *
 * Quem tem "reduzir movimento" ligado no sistema desmonta na hora — a animação
 * está zerada por CSS, então esperar por ela só deixaria a caixa invisível
 * ocupando a tela.
 */
export function useExitTransition(open, duration = MODAL_EXIT_MS) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Estado derivado ajustado no próprio render — a virada de `open` para falso
  // é o que dispara a saída. Fazer isso num efeito custaria um quadro com a
  // caixa já fechada e ainda sem a classe de saída.
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), duration);
    // Reabrir no meio da saída cancela o desmonte
    return () => clearTimeout(timer);
  }, [closing, duration]);

  return { mounted: open || closing, closing };
}

/** Sistema com "reduzir movimento": sai na hora, sem esperar animação zerada. */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Segura o último valor recebido enquanto a caixa fecha.
 *
 * Quem abre o modal costuma zerar o estado no `onClose` (`setPreviewId(null)`),
 * e aí o conteúdo sumiria antes da animação terminar — a saída viraria um
 * esqueleto vazio piscando. Guardando o valor, a caixa sai com o que estava
 * mostrando.
 */
export function useKeepWhileClosing(value, open) {
  // Estado derivado, ajustado no render: ref lida durante o render é proibida
  // pelo React Compiler, e efeito chegaria tarde demais — o valor precisa estar
  // guardado antes do render em que `open` vira falso.
  const [kept, setKept] = useState(value);

  if (open && !Object.is(kept, value)) setKept(value);

  return open ? value : kept;
}
