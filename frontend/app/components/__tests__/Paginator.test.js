import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Paginator } from '@/app/components/Paginator';
import { HISTORY_PAGE_SIZE, pageRangeLabel } from '@/app/lib/pagination';

/**
 * O rodapé que substituiu o "Carregar mais".
 *
 * O botão antigo empilhava página sobre página até o cartão ficar mais alto que
 * a tela. As setas mantêm o cartão do mesmo tamanho — e o que o teste cobre é
 * justamente o que faz a navegação ser navegação: as pontas travadas, o clique
 * andando, e o leitor de tela sabendo onde caiu.
 */
describe('tamanho da página', () => {
  it('são oito registros por vez', () => {
    // O número está num lugar só: as quatro telas de vistorias e as duas de
    // ocorrências leem daqui.
    expect(HISTORY_PAGE_SIZE).toBe(8);
  });
});

describe('pageRangeLabel', () => {
  it('mostra a faixa da primeira página', () => {
    expect(pageRangeLabel({ page: 1, pageSize: 8, total: 24, count: 8 })).toBe('1–8 de 24');
  });

  it('anda com a página', () => {
    expect(pageRangeLabel({ page: 3, pageSize: 8, total: 24, count: 8 })).toBe('17–24 de 24');
  });

  it('não passa do total na última página incompleta', () => {
    expect(pageRangeLabel({ page: 3, pageSize: 8, total: 19, count: 3 })).toBe('17–19 de 19');
  });

  it('sem registro nenhum não há faixa a mostrar', () => {
    expect(pageRangeLabel({ page: 1, pageSize: 8, total: 0, count: 0 })).toBe('');
  });
});

describe('Paginator', () => {
  function renderizar(props = {}) {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const utils = render(
      <Paginator
        page={2}
        pages={3}
        total={24}
        count={8}
        pageSize={8}
        onPrev={onPrev}
        onNext={onNext}
        {...props}
      />
    );
    return { onPrev, onNext, ...utils };
  }

  it('não aparece quando tudo cabe numa página', () => {
    // Um rodapé de navegação que não navega é enfeite ocupando linha.
    const { container } = render(
      <Paginator page={1} pages={1} total={5} count={5} pageSize={8} onPrev={() => {}} onNext={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra em que página se está e de quantas', () => {
    renderizar();
    expect(screen.getByText('9–16 de 24')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('anda para frente e para trás', async () => {
    const { onPrev, onNext } = renderizar();

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onNext).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(onPrev).toHaveBeenCalled();
  });

  it('trava a volta na primeira página', () => {
    // A seta fica, desabilitada, em vez de sumir: uma seta que some faz a
    // pessoa procurar o que desapareceu.
    renderizar({ page: 1 });
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeEnabled();
  });

  it('trava o avanço na última página', () => {
    renderizar({ page: 3 });
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });

  it('não deixa clicar duas vezes enquanto a página anterior ainda chega', () => {
    renderizar({ isFetching: true });
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  });

  it('anuncia a troca a quem não vê a tela', () => {
    renderizar();
    // Sem `aria-live`, apertar a seta troca a lista em silêncio.
    expect(screen.getByText('9–16 de 24')).toHaveAttribute('aria-live', 'polite');
  });

  it('passa no axe', async () => {
    const { container } = renderizar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
