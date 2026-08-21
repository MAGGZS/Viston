import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

/**
 * `<dialog>` no jsdom.
 *
 * O jsdom conhece o elemento, mas não implementa `showModal()` nem `close()` —
 * ele lança "not implemented". Como toda caixa do produto passou a ser um
 * `<dialog>` de verdade, sem isto nenhum teste que abre uma delas roda.
 *
 * A implementação é mínima de propósito: só o bastante para o elemento existir
 * na árvore e o teste conseguir ler o que há dentro. Focus trap e top layer são
 * do navegador, e é justamente por serem dele que o `<dialog>` foi escolhido.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

/** `matchMedia` não existe no jsdom, e `useMediaQuery` o consulta na montagem. */
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

/** O `Select` rola o item ativo para dentro da lista; o jsdom não tem isso. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
