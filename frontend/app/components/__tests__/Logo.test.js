import { render, screen } from '@testing-library/react';
import { Logo } from '@/app/components/Logo';

/**
 * A logo veio do arquivo do Figma e sustenta quatro variantes a partir de um só
 * `size`. O que se testa aqui é o que quebra calado: uma proporção trocada
 * encolhe a marca numa tela só, e dois degradês com o mesmo id fazem a segunda
 * logo da página roubar o do primeiro — nenhum dos dois estoura em teste de
 * fumaça, e os dois aparecem em produção.
 */

const svg = () => screen.getByRole('img', { name: 'Viston' });

describe('Logo', () => {
  it('se anuncia pelo nome da marca', () => {
    render(<Logo size={20} />);
    expect(svg()).toBeInTheDocument();
  });

  // As razões saem do arquivo, onde o wordmark tem corpo 128.
  it.each([
    ['wordmark', 91.52 / 128, 491.937 / 91.52],
    ['mark', 230 / 128, 280.746 / 230],
    // Deitado, a marca vem reduzida a 234 de largura — o ajuste de cabeçalho.
    ['horizontal', 191.704 / 128, 738.937 / 191.704],
    ['stacked', 405 / 128, 503 / 405],
  ])('mantém a proporção do arquivo na variante %s', (variant, hRatio, wRatio) => {
    const size = 32;
    render(<Logo size={size} variant={variant} />);

    const height = size * hRatio;
    expect(Number(svg().getAttribute('height'))).toBeCloseTo(height, 3);
    expect(Number(svg().getAttribute('width'))).toBeCloseTo(height * wRatio, 3);
  });

  it('cai no wordmark quando a variante não existe', () => {
    render(<Logo size={32} variant="nao-existe" />);
    expect(Number(svg().getAttribute('height'))).toBeCloseTo(32 * (91.52 / 128), 3);
  });

  it('dá um degradê próprio a cada instância', () => {
    const { container } = render(
      <>
        <Logo size={20} variant="mark" />
        <Logo size={20} variant="mark" />
      </>
    );

    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    // Sem dois-pontos: `url(#...)` não os aceita.
    ids.forEach((id) => expect(id).not.toContain(':'));
  });

  it('pinta o wordmark com a cor herdada, e a marca com a do arquivo', () => {
    const { container } = render(<Logo size={20} variant="horizontal" />);
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));

    expect(fills).toContain('currentColor');
    expect(fills).toContain('#F5C518');
  });
});
