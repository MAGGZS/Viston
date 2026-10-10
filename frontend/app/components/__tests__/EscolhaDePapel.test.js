import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { EscolhaDePapel } from '@/app/components/EscolhaDePapel';

/**
 * A escolha de papel ao aprovar um pedido de acesso.
 *
 * O que se prende aqui é o que trouxe a tela: nenhum papel vem marcado (um
 * padrão repetiria o visualizador que ninguém escolheu), cada opção diz em qual
 * aparelho funciona, e o papel sem vaga no plano aparece desabilitado com o
 * motivo à vista antes do clique.
 */

const pedido = { id: 'r1', user: { name: 'Ana Souza', email: 'ana@exemplo.com' } };

const capacidadeLivre = {
  INSPECTOR: { allowed: false, code: 'LIMITE_DO_PLANO', reason: 'O plano deste prédio comporta 1 inspetor por prédio.' },
  VIEWER: { allowed: true, code: null, reason: null },
  RESPONSAVEL: { allowed: true, code: null, reason: null },
  MODERADOR: { allowed: false, code: 'RECURSO_DO_PLANO', reason: 'O plano deste prédio não inclui moderadores.' },
};

describe('EscolhaDePapel', () => {
  it('não vem com papel nenhum marcado, e o botão espera a escolha', () => {
    render(<EscolhaDePapel request={pedido} onConfirm={jest.fn()} onBack={jest.fn()} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByRole('button', { name: /escolha um papel/i })).toBeDisabled();
  });

  it('cada opção diz o que a pessoa fará e em qual aparelho', () => {
    render(<EscolhaDePapel request={pedido} onConfirm={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Visualizador' })).toHaveAccessibleDescription(
      /somente pelo computador/i
    );
    expect(screen.getByRole('radio', { name: 'Inspetor' })).toHaveAccessibleDescription(/pelo celular/i);
    expect(screen.getByText(/qual será o papel de/i)).toHaveTextContent('Ana Souza');
  });

  it('o papel que o plano não comporta vem desabilitado, com o motivo à vista', () => {
    render(
      <EscolhaDePapel request={pedido} capacity={capacidadeLivre} onConfirm={jest.fn()} onBack={jest.fn()} />
    );

    const inspetor = screen.getByRole('radio', { name: 'Inspetor' });
    expect(inspetor).toBeDisabled();
    expect(inspetor).toHaveAccessibleDescription(/comporta 1 inspetor por prédio/i);
    expect(screen.getByText(/comporta 1 inspetor por prédio/i)).toBeVisible();

    expect(screen.getByRole('radio', { name: 'Moderador' })).toBeDisabled();
    expect(screen.getByText(/não inclui moderadores/i)).toBeVisible();

    expect(screen.getByRole('radio', { name: 'Visualizador' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Responsável' })).toBeEnabled();
  });

  it('confirma com o papel escolhido', async () => {
    const onConfirm = jest.fn();
    render(
      <EscolhaDePapel request={pedido} capacity={capacidadeLivre} onConfirm={onConfirm} onBack={jest.fn()} />
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Responsável' }));
    await userEvent.click(screen.getByRole('button', { name: /aprovar como responsável/i }));

    expect(onConfirm).toHaveBeenCalledWith('RESPONSAVEL');
  });

  it('o erro do servidor fica ligado ao grupo de opções', () => {
    render(
      <EscolhaDePapel request={pedido} error="O plano deste prédio comporta 1 visualizador por prédio." onConfirm={jest.fn()} onBack={jest.fn()} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/1 visualizador por prédio/);
    expect(screen.getByRole('group')).toHaveAccessibleDescription(/1 visualizador por prédio/);
  });

  it('não tem violações de acessibilidade', async () => {
    const { container } = render(
      <EscolhaDePapel request={pedido} capacity={capacidadeLivre} onConfirm={jest.fn()} onBack={jest.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
