'use client';
import { useSyncExternalStore } from 'react';
import { THEME_COLOR, THEME_KEY, THEMES } from '@/app/lib/theme';

/**
 * Tema claro ou escuro, escolhido por quem usa.
 *
 * A preferência é do aparelho, não da conta: mora no localStorage e nada disso
 * chega ao servidor. Quem entra do celular e do computador tem uma escolha em
 * cada um, que é o que se espera de aparência.
 *
 * O estado de verdade é o atributo `data-theme` do `<html>`, e não uma variável
 * do React. Quem o escreve primeiro é o script de app/layout.js, antes da
 * primeira pintura, então na hora em que a árvore monta o valor já está lá.
 * Guardar uma cópia em `useState` só criaria uma segunda verdade para
 * sincronizar; aqui a página inteira lê a mesma fonte pelo `useSyncExternalStore`.
 */
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * O que o servidor renderiza e o que a hidratação compara. Escuro é o padrão de
 * quem chega, então o HTML sai escuro e o React acerta o tema logo depois de
 * montar, sem acusar divergência.
 */
function getServerSnapshot() {
  return 'dark';
}

export function setTheme(next) {
  if (!THEMES.includes(next)) return;

  document.documentElement.dataset.theme = next;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[next]);

  // Navegação anônima bloqueia a escrita. A troca vale para esta sessão de
  // qualquer jeito; só não sobrevive ao recarregamento.
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}

  listeners.forEach((notify) => notify());
}

/** Tema em uso. Só isto: quem troca chama `setTheme`, que não depende de hook. */
export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
