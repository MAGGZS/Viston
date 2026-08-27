import { renderHook, act } from '@testing-library/react';
import { setTheme, useTheme } from '@/app/lib/tema';
import { THEME_KEY } from '@/app/lib/theme';

/**
 * A escolha de tema.
 *
 * O que precisa continuar valendo: o atributo do `<html>` é a fonte, a escolha
 * sobrevive ao recarregamento, e o armazenamento recusando escrita não derruba
 * a troca na tela. Esse último caso é navegação anônima, e é o que quebra sem
 * ninguém perceber.
 */
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
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
