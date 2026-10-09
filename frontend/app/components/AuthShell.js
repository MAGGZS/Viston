'use client';
import { AuthCarrossel } from '@/app/components/AuthCarrossel';
import { Logo } from '@/app/components/Logo';
import { T, W } from '@/app/lib/theme';

/**
 * Casca das telas de acesso: no computador, a janela partida ao meio — o
 * formulário de um lado, a imagem do outro; no telefone, a coluna única
 * chapada de sempre.
 *
 * A metade da direita não carrega conteúdo do formulário: é o carrossel de
 * fotos de escritório (`AuthCarrossel`), sob o véu dourado-escuro, com o degradê
 * fosco de `--auth-foto-fundo` segurando o espaço até a primeira foto chegar. No
 * telefone ela some — lá a tela inteira já é a superfície, e a imagem roubaria
 * a altura do formulário.
 *
 * A entrada é escalonada de cima para baixo — marca, título, campos, rodapé —,
 * que é a ordem em que a tela é lida. É a primeira coisa que o produto mostra a
 * quem chega, e antes ela aparecia de uma vez, seca.
 *
 * `marca` e `escala` são as duas folgas que cada tela usa conforme a altura que
 * ela gasta:
 *
 * - `marca={false}` tira a logo da coluna. É o que o cadastro faz: com quatro
 *   campos e dois rodapés ele é a tela mais alta do produto, e a marca custa
 *   150px de altura para repetir o que a aba do navegador e a imagem ao lado já
 *   dizem. Sem ela o formulário se alinha ao centro em vez de escorrer para
 *   baixo.
 *   No lugar do lockup inteiro fica só o símbolo, pequeno (`.auth-simbolo`):
 *   sem nenhuma marca a tela parecia de outro produto, e o "V" sozinho devolve
 *   a identidade por uma fração da altura — o wordmark era o que pesava.
 * - `escala` multiplica o tamanho da coluna inteira. O login sobra altura — são
 *   dois campos —, então ele cresce um pouco; o resto fica em 1.
 */
export function AuthShell({ title, subtitle, children, footer, marca = true, escala }) {
  // O posicionamento mora no `globals.css`, e não aqui: ele precisa de media
  // query, e estilo em atributo não tem como expressar uma. Ver `.auth-shell`.
  //
  // Os respiros da coluna seguiram o mesmo caminho e viraram `.auth-marca`,
  // `.auth-titulo`, `.auth-sub`, `.auth-divisor` e `.auth-rodape`: no telefone
  // eles encolhem para o cadastro caber na tela sem rolagem, e estilo em
  // atributo ganha de folha de estilo — em inline, a consulta de media não
  // teria como alcançá-los. Cor continua aqui; medida, não.
  //
  // `--auth-escala` é a exceção que confirma a regra: ela é um valor por tela,
  // e não por largura de janela, então quem a diz é quem chama. Ela entra na
  // conta do `zoom` junto com o degrau de altura — ver `.auth-card__form`.
  return (
    <div className="auth-shell" style={{ background: T.bg, ...(escala ? { '--auth-escala': escala } : {}) }}>
      <div className="auth-card anim-fade-in">
        <div className="auth-card__form">
          <div className="auth-card__col">
            <div style={{ textAlign: 'center' }}>
              {/* A marca abre o escalonamento: mesma subida do resto da coluna, no
                  tempo zero, e daí `d1` a `d4` seguem na ordem de leitura.
                  A logo é um <svg> de bloco, então centraliza por flex — o
                  `text-align` da coluna não a alcança. */}
              {marca && (
                <div className="auth-marca anim-fade-up" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Logo size={40} variant="stacked" />
                </div>
              )}

              {/* Sem o lockup, o símbolo abre a coluna no lugar dele: mesmo
                  tempo zero da marca. É decorativo — o nome já está no título da
                  aba e o h1 continua sendo o título —, então sai do leitor de
                  tela pelo `aria-hidden` do invólucro, que alcança o
                  `role="img"` do <svg>. O `size` é o corpo do wordmark (ver
                  Logo): 22 dá ao "V" cerca de 40px de altura. */}
              {!marca && (
                <div className="auth-simbolo anim-fade-up" aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Logo size={22} variant="mark" />
                </div>
              )}

              {/* Sem a marca, o título vem logo abaixo do símbolo, e o respiro
                  grande que o separava do lockup dá lugar ao do `.auth-simbolo`. */}
              <h1 className="auth-titulo anim-fade-up anim-d1" style={{
                fontFamily: T.display, fontWeight: W.title,
                color: T.text, letterSpacing: '-0.015em',
                ...(marca ? {} : { marginTop: 0 }),
              }}>
                {title}
              </h1>
              {subtitle && (
                <p className="auth-sub anim-fade-up anim-d2" style={{ color: T.mute, lineHeight: 1.6 }}>
                  {subtitle}
                </p>
              )}
            </div>

            <div className="auth-divisor anim-fade-in anim-d2" style={{ background: T.line }} />

            <div className="anim-fade-up anim-d3">{children}</div>

            {footer && (
              <div className="auth-rodape anim-fade-up anim-d4" style={{ textAlign: 'center' }}>{footer}</div>
            )}
          </div>
        </div>

        {/* O painel deixou de ser só degradê e virou o carrossel de fotos. O
            `aria-hidden` que ficava aqui desceu para dentro dele, nas fotos e na
            logo: a barra de progresso são botões, e escondê-la junto tiraria do
            teclado e do leitor de tela o único controle do painel. */}
        <div className="auth-card__art">
          <AuthCarrossel />
        </div>
      </div>
    </div>
  );
}
