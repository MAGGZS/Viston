import { renderHook, act } from '@testing-library/react';
import { setTheme, useTheme, useThemePref } from '@/app/lib/tema';
import { THEME_KEY } from '@/app/lib/theme';

/**
 * A escolha de tema.
 *
 * O que precisa continuar valendo: o atributo do `<html>` é a fonte, a escolha
 * sobrevive ao recarregamento, e o armazenamento recusando escrita não derruba
 * a troca na tela. Esse último caso é navegação anônima, e é o que quebra sem
 * ninguém perceber.
 *
 * Preferência e tema em uso são coisas diferentes: `system` é preferência e
 * nunca chega ao `data-theme`, que só conhece `dark` e `light`. `sistemaClaro`
 * abaixo finge o aparelho em claro, porque o jsdom responde `false` a qualquer
 * consulta de mídia e sem isso o automático seria testado só num dos lados.
 */
function sistemaClaro(claro) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: claro && query === '(prefers-color-scheme: light)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  sistemaClaro(false);
});

describe('tema', () => {
  it('começa no escuro quando ninguém escolheu nada', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toBe('dark');
  });

  it('escreve a escolha no html e guarda para a próxima visita', () => {
    const { result } = renderHook(() => useTheme());

    act(() => setTheme('light'));

    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('sem escolha, a preferência é o automático', () => {
    const { result } = renderHook(() => useThemePref());

    expect(result.current).toBe('system');
  });

  it('no automático, segue a aparência do aparelho', () => {
    sistemaClaro(true);

    const { result } = renderHook(() => useTheme());
    act(() => setTheme('system'));

    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    // O que fica guardado é a preferência, e não o tema que ela resolveu.
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('escolhido o escuro, o aparelho em claro não manda mais', () => {
    sistemaClaro(true);

    const { result } = renderHook(() => useTheme());
    act(() => setTheme('dark'));

    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignora valor que não é tema', () => {
    const { result } = renderHook(() => useTheme());

    act(() => setTheme('sepia'));

    expect(result.current).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('acerta a cor da barra do sistema junto com o tema', () => {
    // No telefone a barra fica encostada na página. Sem esta linha o app vira
    // claro com uma faixa preta em cima, e é a primeira coisa que se vê.
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#0B0B0B');
    document.head.appendChild(meta);

    renderHook(() => useTheme());
    act(() => setTheme('light'));

    expect(meta.getAttribute('content')).toBe('#F5F6F8');

    meta.remove();
  });

  it('troca na tela mesmo com o armazenamento recusando escrita', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const { result } = renderHook(() => useTheme());
    act(() => setTheme('light'));

    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    setItem.mockRestore();
  });
});
