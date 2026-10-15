/**
 * Um `matchMedia` falso que avalia a consulta de verdade.
 *
 * Os mocks antigos procuravam "1024" no texto da consulta. Com a regra do
 * computador dependendo também do ponteiro (ver DESKTOP_QUERY), isso deixou de
 * dizer alguma coisa: aqui a largura, o hover e o ponteiro do aparelho são
 * comparados com cada condição, e a vírgula da lista vale como "ou".
 *
 * Só entende o que o app usa: `min-width`, `max-width`, `hover` e `pointer`.
 * Qualquer outra condição (`prefers-reduced-motion`, por exemplo) dá falso.
 */
export function avaliarMedia(query, { largura, mouse }) {
  return query.split(',').some((parte) => {
    const condicoes = parte.match(/\(([^)]+)\)/g) || [];
    if (condicoes.length === 0) return false;
    return condicoes.every((c) => {
      const [nome, valor] = c.slice(1, -1).split(':').map((x) => x.trim());
      if (nome === 'min-width') return largura >= parseFloat(valor);
      if (nome === 'max-width') return largura <= parseFloat(valor);
      if (nome === 'hover') return mouse ? valor === 'hover' : valor === 'none';
      if (nome === 'pointer') return mouse ? valor === 'fine' : valor === 'coarse';
      return false;
    });
  });
}

/** Computador de mesa com a janela cheia, e telefone. */
export const COMPUTADOR = { largura: 1280, mouse: true };
export const TELEFONE = { largura: 390, mouse: false };

/**
 * Troca o `window.matchMedia` pelo do aparelho dado. Devolve os ouvintes de
 * `change` registrados, para o teste poder avisar a troca de aparelho.
 */
export function simularAparelho(aparelho) {
  const ouvintes = new Set();
  window.matchMedia = (query) => ({
    get matches() {
      return avaliarMedia(query, aparelho);
    },
    media: query,
    onchange: null,
    addEventListener: (_tipo, fn) => ouvintes.add(fn),
    removeEventListener: (_tipo, fn) => ouvintes.delete(fn),
    addListener: (fn) => ouvintes.add(fn),
    removeListener: (fn) => ouvintes.delete(fn),
    dispatchEvent: () => false,
  });
  return ouvintes;
}
