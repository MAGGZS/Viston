'use client';
import { useSyncExternalStore } from 'react';
import { THEME_COLOR, THEME_KEY, THEME_PREFS } from '@/app/lib/theme';

/**
 * Tema claro ou escuro, escolhido por quem usa — ou pelo aparelho.
 *
 * São duas coisas, e misturá-las é o erro fácil aqui: a **preferência** é o que
 * a pessoa marcou (`system`, `dark` ou `light`) e mora no localStorage; o
 * **tema em uso** é sempre `dark` ou `light` e mora no atributo `data-theme` do
 * `<html>`. Com a preferência em `system`, o segundo muda sozinho quando o
 * aparelho troca de aparência, sem ninguém tocar em nada.
 *
 * A preferência é do aparelho, não da conta: nada disso chega ao servidor. Quem
 * entra do celular e do computador tem uma escolha em cada um, que é o que se
 * espera de aparência.
 *
 * O estado de verdade do tema em uso é o atributo, e não uma variável do React.
 * Quem o escreve primeiro é o script de app/layout.js, antes da primeira
 * pintura, então na hora em que a árvore monta o valor já está lá. Guardar uma
 * cópia em `useState` só criaria uma segunda verdade para sincronizar; aqui a
 * página inteira lê a mesma fonte pelo `useSyncExternalStore`.
 */
const listeners = new Set();

const CONSULTA_CLARO = '(prefers-color-scheme: light)';

/**
 * O que o sistema está pedindo agora.
 *
 * Tudo protegido: `matchMedia` não existe em todo lugar onde este módulo roda
 * (ambiente de teste, navegador antigo), e um tema é aparência — nada aqui pode
 * derrubar a tela. Sem resposta do sistema, escuro, que é o padrão do produto.
 */
function temaDoSistema() {
  try {
    return window.matchMedia(CONSULTA_CLARO).matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function lerPreferencia() {
  try {
    const guardada = localStorage.getItem(THEME_KEY);
    return THEME_PREFS.includes(guardada) ? guardada : 'system';
  } catch {
    return 'system';
  }
}

function resolver(preferencia) {
  return preferencia === 'system' ? temaDoSistema() : preferencia;
}

/** Escreve o tema no `<html>` e acerta a barra do sistema no telefone. */
function aplicar(tema) {
  document.documentElement.dataset.theme = tema;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[tema]);
}

function avisar() {
  listeners.forEach((notify) => notify());
}

/**
 * A escuta da troca de aparência do aparelho.
 *
 * Só vale enquanto alguém está olhando: o primeiro componente que pergunta pelo
 * tema liga a escuta, e o último a sair desliga. Quando a preferência não é
 * `system`, a mudança do sistema chega e é ignorada — quem escolheu escuro
 * escolheu escuro, inclusive às sete da manhã.
 */
let consulta = null;

function aoTrocarNoSistema() {
  if (lerPreferencia() !== 'system') return;

  const tema = temaDoSistema();
  if (document.documentElement.dataset.theme === tema) return;

  aplicar(tema);
  avisar();
}

function subscribe(onChange) {
  listeners.add(onChange);

  if (listeners.size === 1) {
    try {
      consulta = window.matchMedia(CONSULTA_CLARO);
      consulta.addEventListener('change', aoTrocarNoSistema);
    } catch {
      consulta = null;
    }
  }

  return () => {
    listeners.delete(onChange);

    if (listeners.size === 0 && consulta) {
      try {
        consulta.removeEventListener('change', aoTrocarNoSistema);
      } catch {}
      consulta = null;
    }
  };
}

function getSnapshot() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function getPrefSnapshot() {
  return lerPreferencia();
}

/**
 * O que o servidor renderiza e o que a hidratação compara. O HTML sai escuro —
 * é o padrão de quem chega e o que o script de layout.js assume enquanto não
 * consegue ler nada —, e o React acerta o tema logo depois de montar, sem
 * acusar divergência.
 */
function getServerSnapshot() {
  return 'dark';
}

function getPrefServerSnapshot() {
  return 'system';
}

export function setTheme(next) {
  if (!THEME_PREFS.includes(next)) return;

  aplicar(resolver(next));

  // Navegação anônima bloqueia a escrita. A troca vale para esta sessão de
  // qualquer jeito; só não sobrevive ao recarregamento.
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}

  avisar();
}

/** Tema em uso: `dark` ou `light`, nunca `system`. É o que pinta a tela. */
export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * A preferência marcada, para quem desenha a própria escolha.
 *
 * Só o seletor de tema precisa dela: com `system` marcado e o aparelho no
 * claro, `useTheme()` diz `light`, e um seletor que se guiasse por ele acenderia
 * "Claro" — mostrando à pessoa uma escolha que ela não fez.
 */
export function useThemePref() {
  return useSyncExternalStore(subscribe, getPrefSnapshot, getPrefServerSnapshot);
}
