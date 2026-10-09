import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AuthCarrossel } from '@/app/components/AuthCarrossel';

/**
 * O carrossel do painel das telas de acesso.
 *
 * O relógio da troca é o fim da animação da barra (`animationend`), e o jsdom
 * não anima nada — então o teste dispara o evento à mão, que é exatamente o
 * que o navegador faria ao fim dos 6,5s.
 */

const REDUZIR = '(prefers-reduced-motion: reduce)';
const matchMediaOriginal = window.matchMedia;

function simularMovimentoReduzido(ligado) {
  window.matchMedia = (query) => ({
    matches: ligado && query === REDUZIR,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

function segmentoAtual() {
  return screen.getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'true');
}

describe('AuthCarrossel', () => {
  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
  });

  it('começa na primeira foto', () => {
    render(<AuthCarrossel />);
    expect(segmentoAtual()).toHaveAccessibleName('Mostrar foto 1 de 3');
  });

  it('clicar no terceiro segmento leva à terceira foto', async () => {
    render(<AuthCarrossel />);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar foto 3 de 3' }));
    expect(segmentoAtual()).toHaveAccessibleName('Mostrar foto 3 de 3');
  });

  it('o fim da animação da barra avança para a próxima foto', () => {
    render(<AuthCarrossel />);
    act(() => {
      fireEvent.animationEnd(screen.getByTestId('auth-barra-ativa'));
    });
    expect(segmentoAtual()).toHaveAccessibleName('Mostrar foto 2 de 3');
  });

  it('com movimento reduzido não avança sozinho', () => {
    simularMovimentoReduzido(true);
    render(<AuthCarrossel />);
    act(() => {
      fireEvent.animationEnd(screen.getByTestId('auth-barra-ativa'));
    });
    expect(segmentoAtual()).toHaveAccessibleName('Mostrar foto 1 de 3');
  });

  it('passa no axe', async () => {
    const { container } = render(<AuthCarrossel />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
