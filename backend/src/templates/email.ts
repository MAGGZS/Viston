/**
 * Os dois e-mails que o sistema manda.
 *
 * A identidade vem do app, não de um desenho novo: fundo `#111`, cartão
 * `#1a1a1a`, dourado `#e0b400` na marca e no que importa, texto `#e8e8e8` —
 * os mesmos valores de `lib/theme.js` no frontend.
 *
 * Tudo em atributo `style`, e nada em `<style>` no topo: Gmail e Outlook
 * descartam folha de estilo em mensagem, e o que sobraria seria texto preto em
 * fundo branco. Tabela nenhuma porque o layout é uma coluna só — `div` com
 * `max-width` basta e lê melhor.
 */

const CARTAO =
  "max-width:520px;margin:0 auto;background:#1a1a1a;border-radius:12px;" +
  "padding:32px;color:#e8e8e8;";
const FUNDO = "background:#111;padding:32px 0;font-family:Arial,Helvetica,sans-serif;";
const CODIGO =
  "margin:0;font-size:34px;font-weight:bold;color:#e0b400;letter-spacing:8px;" +
  "font-family:'Courier New',Courier,monospace;";

function moldura(miolo: string): string {
  return `<div style="${FUNDO}"><div style="${CARTAO}">
    <h1 style="margin:0 0 24px;font-size:20px;color:#e0b400;">Viston</h1>
    ${miolo}
  </div></div>`;
}

/** Bloco do código, igual nos dois e-mails: o número e o prazo, nada mais. */
function blocoCodigo(codigo: string, minutos: number): string {
  return `
    <p style="margin:28px 0 8px;font-size:13px;color:#aaa;">Seu código:</p>
    <p style="${CODIGO}">${codigo}</p>
    <p style="margin:8px 0 0;font-size:12px;color:#888;">
      Válido por ${minutos} minutos.
    </p>`;
}

export function emailVerificacao(nome: string, codigo: string, minutos: number) {
  return {
    assunto: 'Seu código de confirmação do Viston',
    html: moldura(`
      <p>Olá, ${escapar(nome)}.</p>
      <p>Sua conta foi criada. Digite o código abaixo no aplicativo para liberar
         o acesso.</p>
      ${blocoCodigo(codigo, minutos)}
      <p style="margin-top:32px;font-size:12px;color:#888;">
        Se você não criou esta conta, ignore esta mensagem — sem confirmar, ela
        não dá acesso a nada.
      </p>`),
  };
}

export function emailRecuperacao(nome: string, codigo: string, minutos: number) {
  return {
    assunto: 'Seu código para redefinir a senha do Viston',
    html: moldura(`
      <p>Olá, ${escapar(nome)}.</p>
      <p>Recebemos um pedido para redefinir sua senha. Digite o código abaixo no
         aplicativo para escolher uma nova.</p>
      ${blocoCodigo(codigo, minutos)}
      <p style="margin-top:24px;font-size:13px;color:#aaa;">
        Sua senha atual continua valendo até você definir outra.
      </p>
      <p style="margin-top:24px;font-size:12px;color:#888;">
        Se não foi você que pediu, ignore esta mensagem. Ninguém consegue trocar
        sua senha sem este código.
      </p>`),
  };
}

/**
 * O nome vem do cadastro, e cadastro é campo aberto.
 *
 * Sem isto, um nome com `<script>` ou com uma tag de imagem entraria inteiro no
 * HTML da mensagem. O alvo aqui não é o navegador de quem recebe — cliente de
 * e-mail não roda script —, é o que a pessoa lê: um nome com marcação vira
 * layout quebrado, ou um link falso colado no meio de um e-mail legítimo nosso.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
