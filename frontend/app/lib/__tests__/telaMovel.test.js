import { render, screen } from '@testing-library/react';
import { BottomNav } from '@/app/components/BottomNav';
import { ORDEM_TELAS, esquecerTelaAnterior, useDirecaoDaTela } from '@/app/lib/telaMovel';
import { useAuthStore } from '@/app/store/auth';

let caminho = '/home';
jest.mock('next/navigation', () => ({ usePathname: () => caminho }));

/**
 * O deslizar das telas no telefone.
 *
 * Trocar de tela era um corte seco, e num telefone — onde a tela inteira muda
 * de uma vez — o corte não diz se a pessoa avançou ou voltou. A tela passa a
 * entrar pelo lado em que está na barra de baixo.
 *
 * O que se cobre aqui é o lado, que é a única coisa que dá para errar em
 * silêncio: uma tela entrando pela esquerda quando devia vir da direita
 * continua funcionando, só mente sobre onde a pessoa está. O recorte da borda
 * e a barra portada para fora do que anima são coisas de navegador, medidas lá.
 */
function Tela() {
  return <p data-testid="tela" className={useDirecaoDaTela()}>tela</p>;
}

const classeAoIrPara = (destino) => {
  caminho = destino;
  const { unmount } = render(<Tela />);
  const classe = screen.getByTestId('tela').className;
  // Desmontar é o que a troca de tela faz de verdade: quem sai morre antes de
  // quem entra nascer, e é por isso que o "de onde se veio" não pode viver
  // dentro de um componente.
  unmount();
  return classe;
};

beforeEach(() => {
  esquecerTelaAnterior();
  caminho = '/home';
});

describe('useDirecaoDaTela', () => {
  it('não desliza a primeira tela: ela não veio de lado nenhum', () => {
    expect(classeAoIrPara('/home')).toBe('');
  });

  it('traz da direita quem está mais à direita na barra', () => {
    classeAoIrPara('/home');

    expect(classeAoIrPara('/historico')).toBe('anim-slide-from-right');
    expect(classeAoIrPara('/perfil')).toBe('anim-slide-from-right');
  });

  it('traz da esquerda ao voltar', () => {
    classeAoIrPara('/home');
    classeAoIrPara('/perfil');

    expect(classeAoIrPara('/historico')).toBe('anim-slide-from-left');
    expect(classeAoIrPara('/home')).toBe('anim-slide-from-left');
  });

  it('põe os chamados do responsável entre a home e o histórico', () => {
    classeAoIrPara('/home');
    expect(classeAoIrPara('/responsavel')).toBe('anim-slide-from-right');
    expect(classeAoIrPara('/home')).toBe('anim-slide-from-left');

    classeAoIrPara('/perfil');
    expect(classeAoIrPara('/responsavel')).toBe('anim-slide-from-left');
  });

  it('não desliza ao chegar na tela em que já se estava', () => {
    classeAoIrPara('/perfil');
    expect(classeAoIrPara('/perfil')).toBe('');
  });

  it('não desliza tela que não está na barra: entrar nela é descer um nível', () => {
    classeAoIrPara('/home');

    expect(classeAoIrPara('/inspecao')).toBe('');

    // E a vistoria não conta como "de onde se veio": voltar dela para o perfil
    // continua sendo o percurso da home para o perfil.
    expect(classeAoIrPara('/perfil')).toBe('anim-slide-from-right');
  });
});

describe('ORDEM_TELAS', () => {
  /**
   * A divergência entre as duas listas não daria erro nenhum — só inverteria o
   * lado de onde a tela entra, e ninguém ligaria o defeito à lista. Daí o teste
   * ler a barra de verdade em vez de repetir os endereços à mão.
   */
  const enderecosNaBarra = () =>
    screen.getAllByRole('link').map((a) => a.getAttribute('href'));

  // Antes, e não depois: o `afterEach` do próprio testing-library é quem
  // desmonta a barra, e mexer no store enquanto ela ainda está montada dispara
  // um render fora do `act`.
  beforeEach(() => useAuthStore.setState({ user: null }));

  it('casa com a barra de quem atende chamado, que as vê todas', () => {
    useAuthStore.setState({
      user: { name: 'Rita', memberships: [{ role: 'RESPONSAVEL' }] },
    });
    render(<BottomNav />);

    expect(enderecosNaBarra()).toEqual(ORDEM_TELAS);
  });

  it('desenha a barra fora do que anima, e fora do conteúdo principal', () => {
    useAuthStore.setState({ user: { name: 'Rita', memberships: [] } });
    // Um `<main>` a fingir de tela: é lá dentro que as telas escrevem a barra.
    const { container } = render(
      <main id="conteudo"><BottomNav /></main>
    );

    const barra = screen.getByRole('navigation', { name: 'Navegação principal' });
    // Filha do `<body>`: é o que a mantém parada enquanto a tela desliza — um
    // `transform` no caminho a tornaria filha do que anda. E tira o marco de
    // navegação de dentro do conteúdo principal, onde ele nunca devia estar.
    expect(barra.parentElement).toBe(document.body);
    expect(container.querySelector('main')).not.toContainElement(barra);
  });

  it('casa com a barra de quem não atende, sem mudar a ordem do que sobra', () => {
    useAuthStore.setState({ user: { name: 'Rita', memberships: [] } });
    render(<BottomNav />);

    const naBarra = enderecosNaBarra();
    expect(naBarra).not.toContain('/responsavel');
    expect(naBarra).toEqual(ORDEM_TELAS.filter((href) => naBarra.includes(href)));
  });
});
