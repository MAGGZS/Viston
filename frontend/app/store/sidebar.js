'use client';
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * A barra lateral está aberta ou recolhida.
 *
 * O estado mora aqui, e não num `useState` dentro da barra, por dois motivos: a
 * escolha vale para as três áreas de tela larga (admin, moderador e gestor), e
 * as barras remontam a cada navegação — quem as monta é a casca de cada tela.
 * Com estado local, cada clique no menu devolveria a barra ao tamanho padrão.
 */
const KEY = 'viston:sidebar-collapsed';

export const useSidebarStore = create((set, get) => ({
  collapsed: false,

  /**
   * Se a largura já pode animar.
   *
   * Falso até a primeira pintura. A escolha guardada no aparelho só é lida
   * depois dela, e sem esta trava a barra de quem a deixou recolhida apareceria
   * aberta e se fecharia sozinha a cada carregamento — movimento que ninguém
   * pediu, e que se repetiria em toda troca de tela.
   */
  animated: false,
  hydrated: false,

  /** Lê a escolha guardada. Roda uma vez por carregamento da página. */
  hydrate: () => {
    if (get().hydrated) return;

    let collapsed = false;
    try {
      collapsed = window.localStorage.getItem(KEY) === '1';
    } catch {
      // Navegador com storage bloqueado: a barra abre, e é só isso.
    }
    set({ collapsed, hydrated: true });
  },

  toggle: () => {
    const next = !get().collapsed;
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // O mesmo caso de cima: a barra obedece agora, e esquece no próximo dia.
    }
    // Clique é sempre com animação — é o único momento em que ela é o ponto.
    set({ collapsed: next, animated: true });
  },

  enableAnimation: () => {
    if (!get().animated) set({ animated: true });
  },
}));

/**
 * O que a barra precisa saber: se está recolhida, se pode animar, e como virar.
 *
 * A leitura do storage não pode acontecer na inicialização do estado: esta
 * árvore também é renderizada no servidor, onde `localStorage` não existe, e o
 * valor lido ali faria a hidratação divergir do HTML. Por isso ela vem de um
 * efeito, e a animação só entra no quadro seguinte.
 */
export function useSidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const animated = useSidebarStore((s) => s.animated);
  const toggle = useSidebarStore((s) => s.toggle);
  const hydrate = useSidebarStore((s) => s.hydrate);
  const enableAnimation = useSidebarStore((s) => s.enableAnimation);

  useEffect(() => {
    hydrate();
    const frame = requestAnimationFrame(enableAnimation);
    return () => cancelAnimationFrame(frame);
  }, [hydrate, enableAnimation]);

  return { collapsed, animated, toggle };
}
