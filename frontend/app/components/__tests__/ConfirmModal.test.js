import { render, screen } from '@testing-library/react';
import { ConfirmModal, UnsavedChangesModal } from '@/app/components/ConfirmModal';

function Caixa(props) {
  return render(
    <ConfirmModal open title="Tem certeza?" message="Uma pergunta." onConfirm={() => {}} onCancel={() => {}} {...props} />
  );
}

function icone() {
  return screen.getByRole('dialog').querySelector('svg[data-tone]');
}

/**
 * O ícone da confirmação.
 *
 * O triângulo vermelho é só do que destrói. O resto leva o "i" neutro, para o
 * triângulo continuar querendo dizer alguma coisa quando aparece.
 */
describe('ConfirmModal: tom do ícone', () => {
  it('confirmação destrutiva (o padrão) leva o triângulo vermelho', () => {
    Caixa();
    expect(icone()).toHaveAttribute('data-tone', 'danger');
    expect(icone()).toHaveAttribute('aria-hidden', 'true');
  });

  it('confirmação primária leva o ícone neutro', () => {
    Caixa({ confirmVariant: 'primary' });
    expect(icone()).toHaveAttribute('data-tone', 'neutral');
    expect(icone()).toHaveAttribute('aria-hidden', 'true');
  });

  it('`tone` explícito vence o que o botão sugeriria', () => {
    Caixa({ confirmVariant: 'danger', tone: 'neutral' });
    expect(icone()).toHaveAttribute('data-tone', 'neutral');
  });

  it('descartar alterações continua destrutivo', () => {
    render(<UnsavedChangesModal open onConfirm={() => {}} onCancel={() => {}} />);
    expect(icone()).toHaveAttribute('data-tone', 'danger');
  });
});
