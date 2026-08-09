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
      return () => mq.removeEventListener('change', onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Ponto de corte único do app: abaixo disso é a experiência mobile. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY);
}
