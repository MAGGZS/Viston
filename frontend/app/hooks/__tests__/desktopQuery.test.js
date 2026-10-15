import fs from 'fs';
import path from 'path';
import { renderHook, act } from '@testing-library/react';
import { DESKTOP_QUERY } from '@/app/hooks/useMediaQuery';
import { useSidebar, useSidebarStore, JANELA_ESTREITA } from '@/app/store/sidebar';
import { simularAparelho } from '@/app/__tests__/helpers/aparelho';

/**
 * Quando o app é de computador, e o que a barra lateral faz na janela estreita.
 *
 * O `matchMedia` falso avalia a consulta de verdade (largura, hover e
 * ponteiro), em vez de procurar um número no texto: o que quebraria calado é
 * a lista com vírgula virar "e" em vez de "ou", ou alguém tirar o caso do mouse.
 */
describe('DESKTOP_QUERY', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });

  it.each([
    // PC com a janela pela metade (125% de escala): continua computador.
    [{ largura: 920, mouse: true }, true],
    [{ largura: 768, mouse: true }, true],
    [{ largura: 767, mouse: true }, false],
    [{ largura: 1280, mouse: true }, true],
    // Toque: a regra de antes, computador só a partir de 1024.
    [{ largura: 920, mouse: false }, false],
    [{ largura: 1024, mouse: false }, true],
    [{ largura: 390, mouse: false }, false],
  ])('%o → computador: %s', (cenario, esperado) => {
    simularAparelho(cenario);
    expect(window.matchMedia(DESKTOP_QUERY).matches).toBe(esperado);
  });

  /**
   * CSS e JS decidem a mesma coisa em dois lugares: o `desk:` do globals.css e
   * esta constante. Se um mudar sem o outro, a tela some num e aparece no outro.
   */
  describe('anda junto com o globals.css', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'globals.css'), 'utf8');
    const normalizar = (q) => q.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();

    it('a variante `desk` usa a mesma consulta', () => {
      const bloco = css.match(/@custom-variant desk\s*\{\s*@media ([^{]+)\{/);
      expect(bloco).not.toBeNull();
      expect(normalizar(bloco[1])).toBe(normalizar(DESKTOP_QUERY));
    });

    it.each(['.ajuda-miolo', '.ajuda-topo'])('o @media de %s usa a mesma consulta', (seletor) => {
      const escapado = seletor.replace('.', '\\.');
      const regras = [...css.matchAll(new RegExp(`@media ([^{]+)\\{\\s*${escapado}\\s*\\{`, 'g'))];
      expect(regras).toHaveLength(1);
      expect(normalizar(regras[0][1])).toBe(normalizar(DESKTOP_QUERY));
    });
  });
});

describe('JANELA_ESTREITA', () => {
  it('é o complemento dos 1024px da regra do computador', () => {
    expect(JANELA_ESTREITA).toBe('(max-width: 1023.98px)');
    expect(DESKTOP_QUERY).toContain('(min-width: 1024px)');
  });
});

describe('useSidebar na janela estreita', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.localStorage.clear();
    useSidebarStore.setState({ collapsed: false, abertaNoEstreito: false, hydrated: false });
  });
  afterEach(() => { window.matchMedia = original; });

  it('começa como trilho entre 768 e 1023px sem mexer na escolha guardada', () => {
    simularAparelho({ largura: 900, mouse: true });
    expect(window.matchMedia(JANELA_ESTREITA).matches).toBe(true);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    // A escolha da janela larga continua a mesma.
    expect(useSidebarStore.getState().collapsed).toBe(false);
  });

  it('na janela larga segue a escolha guardada', () => {
    simularAparelho({ largura: 1280, mouse: true });
    const { result } = renderHook(() => useSidebar());
    expect(result.current.collapsed).toBe(false);
  });

  it.each([
    ['aberta', '0', false],
    ['recolhida', '1', true],
  ])('ao alargar a janela volta à escolha guardada (%s) sem gravar nada', (_nome, guardado, recolhida) => {
    window.localStorage.setItem('viston:sidebar-collapsed', guardado);
    simularAparelho({ largura: 900, mouse: true });
    const { result } = renderHook(() => useSidebar());

    // Abre (ou fecha) à mão na janela estreita: empréstimo, não escolha.
    act(() => result.current.toggle());
    expect(window.localStorage.getItem('viston:sidebar-collapsed')).toBe(guardado);

    // A janela cruza os 1024px.
    simularAparelho({ largura: 1280, mouse: true });
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(result.current.collapsed).toBe(recolhida);
    expect(window.localStorage.getItem('viston:sidebar-collapsed')).toBe(guardado);
  });
});
