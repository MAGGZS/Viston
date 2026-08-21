import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Input, Modal, Select, Toggle } from '@/app/components/ui';

/**
 * Os componentes que aparecem em toda tela.
 *
 * O que se testa aqui é o que a revisão de acessibilidade apontou: a caixa que
 * não se anunciava como diálogo, o campo cujo erro ninguém ouvia, o cartão que
 * o teclado não alcançava. São regressões caras de descobrir na mão — nenhuma
 * delas aparece olhando a tela.
 */

// ── Modal ─────────────────────────────────────────────────────────────────────
describe('Modal', () => {
  it('é um diálogo, com nome', () => {
    render(
      <Modal open onClose={() => {}} title="Excluir conta">
        <p>Isto não tem volta.</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // O nome vem do título, por `aria-labelledby`: sem ele o leitor de tela
    // anuncia "diálogo" e mais nada.
    expect(dialog).toHaveAccessibleName('Excluir conta');
    expect(screen.getByText('Isto não tem volta.')).toBeInTheDocument();
  });

  it('avisa quem abriu quando o Escape é apertado', async () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="Filtros">conteúdo</Modal>);

    // `cancel` é o evento que o `<dialog>` dispara no Escape. Quem fecha é o
    // estado de fora — é o que preserva a animação de saída.
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(onClose).toHaveBeenCalled();
  });

  it('não deixa nada na tela quando está fechado', () => {
    render(<Modal open={false} onClose={() => {}} title="Filtros">conteúdo</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passa no axe', async () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Excluir conta">
        <p>Isto não tem volta.</p>
      </Modal>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────
describe('Input', () => {
  it('liga o rótulo ao campo', () => {
    render(<Input label="E-mail" name="email" />);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });

  it('anuncia o erro e o aponta a partir do campo', () => {
    render(<Input label="E-mail" name="email" error="E-mail inválido" />);

    const campo = screen.getByLabelText('E-mail');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    // `role="alert"` é o que faz o leitor de tela falar quando a mensagem
    // aparece — antes era só um texto vermelho ao lado.
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido');
    expect(campo).toHaveAccessibleDescription('E-mail inválido');
  });

  it('sem erro, não marca o campo como inválido', () => {
    render(<Input label="E-mail" name="email" />);
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid');
  });

  it('passa no axe', async () => {
    const { container } = render(<Input label="E-mail" name="email" error="E-mail inválido" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── Toggle ────────────────────────────────────────────────────────────────────
describe('Toggle', () => {
  it('é uma caixa de seleção que o teclado alcança', async () => {
    const onChange = jest.fn();
    render(<Toggle checked={false} onChange={onChange} label="Nada a relatar" />);

    const chave = screen.getByRole('checkbox', { name: 'Nada a relatar' });
    expect(chave).not.toBeChecked();

    // Espaço é o gesto de teclado da caixa de seleção. Como `<div onClick>`,
    // ela não recebia foco nem respondia a tecla nenhuma.
    chave.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ── Select ────────────────────────────────────────────────────────────────────
describe('Select', () => {
  const opcoes = [
    { value: 'ALTA', label: 'Alta' },
    { value: 'MEDIA', label: 'Média' },
    { value: 'BAIXA', label: 'Baixa' },
  ];

  it('abre pelo teclado e escolhe com Enter', async () => {
    const onChange = jest.fn();
    render(<Select label="Prioridade" options={opcoes} value="" onChange={onChange} />);

    const gatilho = screen.getByRole('combobox');
    gatilho.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(gatilho).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowDown}{Enter}');
    // O `Select` entrega um evento com `target.value`, como o campo nativo
    // fazia: quem chama (react-hook-form incluso) não precisa saber da troca.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: 'MEDIA' }) })
    );
  });

  it('marca o erro no gatilho, e o anuncia', () => {
    render(<Select label="Prioridade" options={opcoes} value="" error="Prioridade é obrigatória" />);

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Prioridade é obrigatória');
  });
});
