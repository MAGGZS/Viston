'use client';
import { Logo } from '@/app/components/Logo';
import { T, W } from '@/app/lib/theme';

/**
 * Casca das telas de acesso: no computador, a janela partida ao meio — o
 * formulário de um lado, a imagem do outro; no telefone, a coluna única
 * chapada de sempre.
 *
 * A metade da direita não carrega conteúdo, e é de propósito: é o lugar da
 * imagem da tela de acesso (`--auth-art-img`, em globals.css), com o degradê
 * fosco segurando o espaço até ela chegar. No telefone ela some — lá a tela
 * inteira já é a superfície, e a imagem roubaria a altura do formulário.
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

              {/* Sem a marca, o título é quem abre a coluna, e o respiro que o
                  separava dela não tem mais o que separar. */}
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

        {/* `aria-hidden` porque não há o que anunciar: é superfície, não figura.
            Sem ele, o leitor de tela pararia num `<div>` vazio entre o rodapé do
            formulário e o fim da página. */}
        <div className="auth-card__art" aria-hidden="true" />
      </div>
    </div>
  );
}
