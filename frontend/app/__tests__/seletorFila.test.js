import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ABAS, SeletorFila, entradaDaFila } from '@/app/responsavel/page';

/**
 * O seletor de fila da tela do responsável.
 *
 * Ele acendia a fila escolhida e apagava a anterior — dois eventos que a pessoa
 * tinha de juntar sozinha para saber o que mudou. Agora o dourado é uma peça só
 * que corre, e a lista entra pelo lado em que essa peça parou.
 *
 * O que se cobre aqui é a aritmética disso: quanto a pílula anda em cada fila,
 * e de que lado os cartões vêm. A curva do movimento é partilhada por
 * construção (`MOTION.slide`, em lib/theme.js) e não tem o que testar; o que
 * quebra em silêncio é o número, se um dia alguém puser vão entre as colunas ou
 * mudar a quantidade de filas.
 */
function Tela() {
  const [atual, setAtual] = useState('RECEBER');
  const contagem = { RECEBER: 2, ANDAMENTO: 0, CONCLUIDOS: 7 };

  return <SeletorFila abas={ABAS} atual={atual} onPick={setAtual} contagem={contagem} />;
}

/** A pílula é o único filho sem papel — os rótulos são todos `tab`. */
const pilula = (container) => container.querySelector('[aria-hidden="true"]');

const aba = (nome) => screen.getByRole('tab', { name: nome });

describe('SeletorFila', () => {
  it('põe a pílula sobre a fila aberta, uma coluna por passo', async () => {
    const user = userEvent.setup();
    const { container } = render(<Tela />);

    // Uma coluna de três, e o trilho descontado dos 4px de folga de cada lado:
    // é o que permite andar por porcentagem sem medir nada no DOM.
    expect(pilula(container)).toHaveStyle({ width: 'calc((100% - 8px) / 3)' });
    expect(pilula(container)).toHaveStyle({ transform: 'translateX(0%)' });

    await user.click(aba(/Em andamento/));
    expect(pilula(container)).toHaveStyle({ transform: 'translateX(100%)' });

    await user.click(aba(/Concluídos/));
    expect(pilula(container)).toHaveStyle({ transform: 'translateX(200%)' });

    await user.click(aba(/A receber/));
    expect(pilula(container)).toHaveStyle({ transform: 'translateX(0%)' });
  });

  it('não engorda a palavra da fila aberta: o peso é o mesmo nas três', () => {
    render(<Tela />);

    // "Em andamento" em 600 é mais larga que em 400. Com o peso variando, o
    // trilho mudava de largura no meio da viagem e a pílula chegava tremendo.
    for (const item of ABAS) {
      expect(screen.getByRole('tab', { name: new RegExp(item.label) })).toHaveStyle({ fontWeight: 600 });
    }
  });

  it('diz qual fila está aberta a quem não vê a cor', async () => {
    const user = userEvent.setup();
    render(<Tela />);

    expect(aba(/A receber/)).toHaveAttribute('aria-selected', 'true');
    expect(aba(/Concluídos/)).toHaveAttribute('aria-selected', 'false');

    await user.click(aba(/Concluídos/));
    expect(aba(/Concluídos/)).toHaveAttribute('aria-selected', 'true');
    expect(aba(/A receber/)).toHaveAttribute('aria-selected', 'false');
  });

  it('mostra o número só nas filas que têm trabalho', () => {
    render(<Tela />);

    expect(aba(/A receber/)).toHaveTextContent('2');
    expect(aba(/Concluídos/)).toHaveTextContent('7');
    // Zero não vira "0" no botão: uma fila vazia não pede leitura.
    expect(aba(/Em andamento/)).toHaveTextContent(/^Em andamento$/);
  });
});

describe('entradaDaFila', () => {
  it('traz a lista do lado em que o botão está', () => {
    expect(entradaDaFila('RECEBER')).toBe('anim-slide-from-left');
    expect(entradaDaFila('CONCLUIDOS')).toBe('anim-slide-from-right');
  });

  it('faz a fila do meio subir, porque ela não tem lado', () => {
    expect(entradaDaFila('ANDAMENTO')).toBe('anim-fade-up');
  });

  it('sobe também quando a fila não existe, em vez de vir de lugar nenhum', () => {
    expect(entradaDaFila('INVENTADA')).toBe('anim-fade-up');
  });
});
