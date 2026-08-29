import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { UnsavedChangesModal } from '@/app/components/ConfirmModal';
import { UnsavedGuard } from '@/app/components/UnsavedGuard';
import {
  UnsavedScope,
  useUnsavedField,
  useUnsavedGuard,
  useUnsavedScope,
} from '@/app/hooks/useUnsavedGuard';
import { useUnsavedStore } from '@/app/store/unsaved';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: (...a) => push(...a) }) }));

/**
 * A saída de um formulário mexido.
 *
 * A regra é uma só no sistema inteiro — ninguém sai de um formulário alterado
 * sem confirmar —, e ela tem dois lados. O de dentro é a caixa que fecha: quem
 * não mexeu em nada fecha direto, quem mexeu responde antes. O de fora é a
 * navegação: a barra de baixo, o menu lateral, o link — nenhum deles sabe que
 * havia um formulário na tela, e é a guarda do layout que os segura.
 */
function Caixa({ onClose }) {
  const [texto, setTexto] = useState('');
  const saida = useUnsavedGuard(texto !== '');

  return (
    <div>
      <label htmlFor="nota">Nota</label>
      <input id="nota" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <button type="button" onClick={() => saida.guard(onClose)}>Fechar</button>
      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </div>
  );
}

/** Um campo que mora um nível abaixo de quem fecha — o caso do modal de chamado. */
function CaixaComFilho({ onClose }) {
  const { dirty, report } = useUnsavedScope();
  const saida = useUnsavedGuard(dirty);

  return (
    <div>
      <UnsavedScope report={report}>
        <CampoFilho />
      </UnsavedScope>
      <button type="button" onClick={() => saida.guard(onClose)}>Fechar</button>
      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </div>
  );
}

function CampoFilho() {
  const [texto, setTexto] = useState('');
  useUnsavedField(texto !== '');

  return (
    <>
      <label htmlFor="filho">Nota</label>
      <input id="filho" value={texto} onChange={(e) => setTexto(e.target.value)} />
    </>
  );
}

/**
 * Um formulário de react-hook-form ligado ao registro, como os do cadastro e o
 * de novo usuário do admin.
 *
 * `defaultValues` declarado é o que faz `isDirty` voltar a falso quando a
 * pessoa apaga o que escreveu. Sem ele, `_defaultValues` é `{}` e `_formValues`
 * ganha as chaves dos campos assim que eles montam — os dois nunca mais se
 * igualam, e o formulário fica "mexido" para sempre.
 */
function FormularioRHF() {
  const { register, formState: { isDirty } } = useForm({ defaultValues: { nome: '' } });
  const saida = useUnsavedGuard(isDirty);

  return (
    <div>
      <label htmlFor="rhf">Nome</label>
      <input id="rhf" {...register('nome')} />
      <button type="button" onClick={() => saida.guard(() => {})}>Fechar</button>
      <UnsavedChangesModal open={saida.asking} onConfirm={saida.confirm} onCancel={saida.cancel} />
    </div>
  );
}

const perguntou = () => screen.queryByText('Descartar alterações?');

beforeEach(() => {
  push.mockClear();
  useUnsavedStore.setState({ dirty: [], pending: null });
});

describe('useUnsavedGuard', () => {
  it('deixa sair na hora quem não mexeu em nada', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<Caixa onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
    expect(perguntou()).not.toBeInTheDocument();
  });

  it('pergunta antes de descartar o que foi digitado', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<Caixa onClose={onClose} />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(perguntou()).toBeInTheDocument();
  });

  it('"continuar editando" devolve a pessoa ao formulário, com o texto no lugar', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<Caixa onClose={onClose} />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(onClose).not.toHaveBeenCalled();
    // A caixa fica montada enquanto a animação de saída roda (ver
    // `useExitTransition`) — o que se espera é que ela saia, não que suma no
    // mesmo quadro.
    await waitFor(() => expect(perguntou()).not.toBeInTheDocument());
    expect(screen.getByLabelText('Nota')).toHaveValue('trocar a lâmpada');
  });

  it('"descartar" faz o que estava para acontecer', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<Caixa onClose={onClose} />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sai do registro quando a pessoa apaga o que tinha escrito', async () => {
    const user = userEvent.setup();
    render(<FormularioRHF />);

    await user.type(screen.getByLabelText('Nome'), 'ana');
    expect(useUnsavedStore.getState().dirty).toHaveLength(1);

    // O formulário volta ao que era: não há mais nada a perder, e o menu tem de
    // voltar a deixar passar. Enquanto isto ficava preso, todo link da tela
    // perguntava "descartar alterações?" pelo resto da sessão.
    await user.clear(screen.getByLabelText('Nome'));
    expect(useUnsavedStore.getState().dirty).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(perguntou()).not.toBeInTheDocument();
  });

  it('enxerga o campo que mora dentro de um filho', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<CaixaComFilho onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Nota'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(perguntou()).toBeInTheDocument();
  });
});

describe('UnsavedGuard', () => {
  function Tela() {
    return (
      <>
        <UnsavedGuard />
        <Caixa onClose={() => {}} />
        {/* O `preventDefault` é do jsdom, não do produto: ele não navega, e o
            clique sem isto vira um erro de "navigation not implemented" no
            console. A guarda escuta na fase de captura, então ela vê o clique
            antes deste `onClick` — é o mesmo que ela veria num link de verdade. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div onClick={(e) => e.preventDefault()}>
          <a href="/historico">Histórico</a>
        </div>
      </>
    );
  }

  it('deixa o link passar enquanto não há nada preenchido', async () => {
    const user = userEvent.setup();
    render(<Tela />);

    await user.click(screen.getByRole('link', { name: 'Histórico' }));

    expect(perguntou()).not.toBeInTheDocument();
    // Sem guarda no caminho, quem navega é o próprio link.
    expect(push).not.toHaveBeenCalled();
  });

  it('segura o link quando há formulário mexido na tela, e navega depois do sim', async () => {
    const user = userEvent.setup();
    render(<Tela />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    await user.click(screen.getByRole('link', { name: 'Histórico' }));

    expect(push).not.toHaveBeenCalled();
    expect(perguntou()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(push).toHaveBeenCalledWith('/historico');
  });

  it('o "não" da navegação deixa tudo como estava', async () => {
    const user = userEvent.setup();
    render(<Tela />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    await user.click(screen.getByRole('link', { name: 'Histórico' }));
    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nota')).toHaveValue('trocar a lâmpada');
  });

  it('tira o formulário do registro quando ele sai da tela', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tela />);

    await user.type(screen.getByLabelText('Nota'), 'trocar a lâmpada');
    expect(useUnsavedStore.getState().dirty).toHaveLength(1);

    rerender(<><UnsavedGuard /></>);
    expect(useUnsavedStore.getState().dirty).toHaveLength(0);
  });
});
