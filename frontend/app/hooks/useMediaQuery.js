'use client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Lê uma media query como fonte externa de estado.
 *
 * `useSyncExternalStore` evita o par useState + useEffect que renderizava duas
 * vezes a cada carga (uma com o valor errado, outra depois do efeito). No
 * servidor o retorno é `false`, então o snapshot de hidratação bate com o HTML.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      // Rede de segurança: em alguns contextos o `change` não chega e o React
      // fica preso no valor antigo enquanto o CSS já reagiu. O snapshot só muda
      // ao cruzar o breakpoint, então isso não gera render a mais.
      window.addEventListener('resize', onChange);
      return () => {
        mq.removeEventListener('change', onChange);
        window.removeEventListener('resize', onChange);
      };
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Quando o app vira a experiência de computador. Fonte única: o mesmo texto
 * mora na variante `desk:` de app/globals.css, e os dois precisam andar juntos.
 *
 * Não é só largura. Um PC com a janela pela metade (meia tela com escala de
 * 125% dá uns 920px CSS) caía na experiência de telefone, e no computador isso
 * não pode acontecer. Então quem tem mouse ou trackpad (`hover` + `pointer:
 * fine`) continua no computador até 768px; telefone e tablet de toque seguem a
 * regra de antes (computador só a partir de 1024px). Abaixo de 768px é sempre
 * a experiência mobile.
 *
 * A vírgula é o "ou" da lista de media queries.
 */
export const DESKTOP_QUERY = '(min-width: 1024px), (hover: hover) and (pointer: fine) and (min-width: 768px)';

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY);
}
