import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { FloorForm } from '@/app/components/FloorForm';

/**
 * O formulário de um andar.
 *
 * É a tela em que o produto realmente acontece — e a que mais erra, porque tem
 * cinco campos por ocorrência. Os casos abaixo são os que decidem se o inspetor
 * consegue enviar o andar: o atalho de "nada a relatar", a recusa do andar
 * incompleto, e o erro chegando a quem não vê a tela.
 */
const andar = { id: 'andar-1', label: '6º Andar' };

function renderizar(props = {}) {
  const onSubmit = jest.fn();
  const utils = render(
    <FloorForm
      floor={andar}
      inspectorName="Carlos"
      responsibles={[{ id: 'r1', name: 'Marina' }]}
      onSubmit={onSubmit}
      isLast={false}
      {...props}
    />
  );
  return { onSubmit, ...utils };
}

describe('FloorForm', () => {
  it('mostra quem está vistoriando e a data', () => {
    // O rótulo do andar fica no cabeçalho da página, não aqui: o formulário
    // sabe qual andar é, mas quem o anuncia é a tela em volta.
    renderizar();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText(new Date().toLocaleDateString('pt-BR'))).toBeInTheDocument();
  });

  it('"nada a relatar" envia o andar sem ocorrência nenhuma', async () => {
    // O caminho mais comum de todos: o andar em que não há o que registrar.
    // Se ele exigisse preencher uma ocorrência vazia, uma vistoria de vinte
    // andares viraria vinte formulários inúteis.
    const { onSubmit } = renderizar();

    await userEvent.click(screen.getByRole('checkbox', { name: /nada a relatar/i }));
    await userEvent.click(screen.getByRole('button', { name: /pr[óo]ximo andar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([]));
  });

  it('recusa a ocorrência sem descrição, e diz por quê', async () => {
    const { onSubmit } = renderizar();

    await userEvent.click(screen.getByRole('button', { name: /pr[óo]ximo andar/i }));

    // `role="alert"` é o que faz o leitor de tela anunciar: antes o erro era um
    // texto vermelho que só quem enxergava a tela via.
    const erros = await screen.findAllByRole('alert');
    expect(erros.length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('marca o campo inválido para quem usa leitor de tela', async () => {
    renderizar();

    await userEvent.click(screen.getByRole('button', { name: /pr[óo]ximo andar/i }));

    // O droplist do tipo é o primeiro campo a falhar, e é ele que o leitor de
    // tela precisa anunciar como inválido — não bastava a borda vermelha.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Tipo de manutenção' })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    );
  });

  it('a descrição vazia também é apontada', async () => {
    // O único campo livre da ocorrência, e o que o inspetor mais deixa passar.
    renderizar();

    await userEvent.click(screen.getByRole('button', { name: /pr[óo]ximo andar/i }));

    await waitFor(() =>
      expect(screen.getByText('Descreva a ocorrência')).toHaveAttribute('role', 'alert')
    );
    expect(screen.getByLabelText('Descrição')).toHaveAttribute('aria-invalid', 'true');
  });

  it('no último andar, o botão diz que vai enviar', () => {
    renderizar({ isLast: true });
    expect(screen.getByRole('button', { name: /enviar vistoria/i })).toBeInTheDocument();
  });

  it('volta com o que já estava preenchido', () => {
    // É o que faz o botão "voltar" não apagar o trabalho do andar anterior — e
    // o que faz o rascunho retomado aparecer preenchido.
    renderizar({
      initialRecords: [
        {
          maintenance_type: 'PINTURA',
          category: 'CORRETIVA',
          priority: 'MEDIA',
          description: 'Parede descascando junto à janela',
          responsible_id: '',
        },
      ],
    });

    expect(screen.getByDisplayValue('Parede descascando junto à janela')).toBeInTheDocument();
  });

  it('passa no axe', async () => {
    const { container } = renderizar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
