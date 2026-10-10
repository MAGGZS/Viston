import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ModalShareBuilding } from '@/app/components/ModalShareBuilding';

/**
 * O painel de compartilhar o prédio.
 *
 * O que se prende aqui: cada forma de convite diz para quem é, o aviso do
 * código conta o que o servidor faz de verdade ao gerar outro (não tira
 * ninguém do prédio, não limpa a fila) e gerar um código novo nunca acontece
 * num clique só.
 */

const mockRotateKey = jest.fn();
let mockRotateKeyPending = false;

jest.mock('../../hooks/useApi', () => ({
  useBuildingShareToken: () => ({
    data: { token: 'ABCD2345', expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
    isLoading: false,
    refetch: jest.fn(),
  }),
  useRotateBuildingShareToken: () => ({ mutate: jest.fn(), isPending: false }),
  useRotateShareKey: () => ({ mutate: mockRotateKey, isPending: mockRotateKeyPending }),
}));

beforeEach(() => {
  mockRotateKey.mockReset();
  mockRotateKeyPending = false;
});

function abrir(props = {}) {
  return render(
    <ModalShareBuilding
      open
      centered
      onClose={jest.fn()}
      buildingId="p1"
      buildingName="Edifício Aurora"
      shareKey="ABCD23456789"
      {...props}
    />
  );
}

describe('ModalShareBuilding', () => {
  it('fechado e sem prédio, renderiza sem quebrar', () => {
    // A página do gestor monta o painel sempre, com buildingId undefined
    // enquanto nenhum prédio foi aberto.
    expect(() =>
      render(
        <ModalShareBuilding
          open={false}
          centered
          onClose={jest.fn()}
          buildingId={undefined}
          buildingName={undefined}
          shareKey={undefined}
        />
      )
    ).not.toThrow();
  });

  it('diz para quem é cada forma de convite', () => {
    abrir();

    expect(screen.getByText('Para quem está com você agora. Valem 15 minutos.')).toBeInTheDocument();
    expect(screen.getByText('Para mandar por mensagem. Vale até você gerar outro.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se este código foi parar onde não devia, gere um novo. O código antigo para de funcionar na hora.'
      )
    ).toBeInTheDocument();
  });

  it('gerar novo código pede confirmação e explica o que acontece', async () => {
    abrir();

    await userEvent.click(screen.getByRole('button', { name: /gerar novo código/i }));
    expect(mockRotateKey).not.toHaveBeenCalled();

    const confirmacao = screen.getByRole('group', { name: /confirmar novo código/i });
    expect(confirmacao).toHaveTextContent(/quem já está no prédio continua nele/i);
    expect(confirmacao).toHaveTextContent(/pedidos que já chegaram continuam esperando sua resposta/i);

    await userEvent.click(screen.getByRole('button', { name: /^gerar novo código$/i }));
    expect(mockRotateKey).toHaveBeenCalledWith('p1', expect.any(Object));
  });

  it('cancelar a confirmação não gera nada', async () => {
    abrir();

    await userEvent.click(screen.getByRole('button', { name: /gerar novo código/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByRole('group', { name: /confirmar novo código/i })).not.toBeInTheDocument();
    expect(mockRotateKey).not.toHaveBeenCalled();
  });

  it('mostra o código novo assim que o servidor responde', async () => {
    mockRotateKey.mockImplementation((_id, { onSuccess }) => onSuccess({ share_key: 'WXYZ98765432' }));
    abrir();

    await userEvent.click(screen.getByRole('button', { name: /gerar novo código/i }));
    await userEvent.click(screen.getByRole('button', { name: /^gerar novo código$/i }));

    expect(screen.getByRole('button', { name: /copiar código do prédio WXYZ/i })).toBeInTheDocument();
  });

  it('sem a chave do prédio, a seção do código não aparece', () => {
    abrir({ shareKey: undefined });
    expect(screen.queryByText(/código do prédio/i)).not.toBeInTheDocument();
  });

  it('não tem violações de acessibilidade', async () => {
    abrir();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
