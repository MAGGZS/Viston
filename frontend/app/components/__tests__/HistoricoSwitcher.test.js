import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HISTORICO_VIEWS, HistoricoSwitcher, useHistoricoView } from '@/app/components/HistoricoSwitcher';

/**
 * O alternador do cartão de histórico.
 *
 * Eram duas setas em volta do título, e elas não diziam para onde levavam: com
 * só duas visões, a da esquerda e a da direita davam no mesmo lugar. O que se
 * cobre aqui é o que os botões trouxeram — cada um leva à sua visão, e a tela
 * mostra qual está aberta sem ninguém precisar tocar para descobrir.
 */
function Tela() {
  const historico = useHistoricoView();

  return (
    <div>
      <HistoricoSwitcher
        view={historico.view}
        onSelect={historico.select}
        title={historico.title}
      />
      <p>{historico.isVistorias ? 'lista de vistorias' : 'lista de ocorrências'}</p>
    </div>
  );
}

const aba = (nome) => screen.getByRole('tab', { name: nome });

describe('HistoricoSwitcher', () => {
  it('abre nas vistorias, que é onde o histórico sempre abriu', () => {
    render(<Tela />);

    expect(aba('Vistorias')).toHaveAttribute('aria-selected', 'true');
    expect(aba('Ocorrências')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Histórico de vistorias')).toBeInTheDocument();
    expect(screen.getByText('lista de vistorias')).toBeInTheDocument();
  });

  it('troca de histórico no botão da visão pedida, e não no da "próxima"', async () => {
    const user = userEvent.setup();
    render(<Tela />);

    await user.click(aba('Ocorrências'));

    expect(aba('Ocorrências')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Histórico de ocorrências')).toBeInTheDocument();
    expect(screen.getByText('lista de ocorrências')).toBeInTheDocument();

    // Tocar de novo na que já está aberta não é uma armadilha: continua nela.
    await user.click(aba('Ocorrências'));
    expect(screen.getByText('lista de ocorrências')).toBeInTheDocument();

    await user.click(aba('Vistorias'));
    expect(screen.getByText('lista de vistorias')).toBeInTheDocument();
  });

  it('põe um botão para cada visão, com o nome curto dela', () => {
    render(<Tela />);

    const nomes = screen.getAllByRole('tab').map((b) => b.textContent);
    expect(nomes).toEqual(HISTORICO_VIEWS.map((v) => v.tab));
  });

  it('não tem falha de acessibilidade', async () => {
    const { container } = render(<Tela />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
