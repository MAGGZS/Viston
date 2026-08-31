/**
 * Os dois e-mails que o sistema manda.
 *
 * A identidade vem dos tokens do produto, e não de um desenho paralelo: os
 * mesmos valores que `globals.css` declara no tema escuro — `page #0B0B0B`,
 * `card #171717`, `chip #232323`, `accent #F5C518`, e a régua de `ink`/`mute`/
 * `faint` em 96%, 68% e 52% de branco.
 *
 * A regra do produto vale aqui: **fundo usa `accent`, letra usa `accentInk`**.
 * No escuro os dois são o mesmo `#F5C518`. O dourado aparece duas vezes, e as
 * duas de propósito: a faixa no topo do cartão, que é fundo, e o código, que
 * sobre o `chip` dá cerca de 9:1.
 *
 * Sobre as escolhas de e-mail, que não são as de uma página:
 *
 * Tabelas, e não `div` com `max-width`. O Outlook do Windows renderiza com o
 * motor do Word, que ignora `max-width` — a mensagem sairia esticada na largura
 * da janela.
 *
 * Tudo em atributo `style`, nada em `<style>` no topo: vários clientes
 * descartam folha de estilo, e o que sobraria seria texto preto em fundo
 * branco.
 *
 * As fontes do produto entram como primeira escolha e caem para as do sistema.
 * Gmail e Outlook removem `<link>` de webfont, então quase todo mundo lê em
 * Arial e no monoespaçado do sistema — a hierarquia sobrevive porque está no
 * tamanho, no peso e no espaçamento, não na fonte.
 *
 * O código fica numa string só, e não em seis caixinhas separadas. A grade de
 * dígitos é mais bonita e quebra o que a pessoa mais faz aqui: selecionar e
 * colar. Copiar de seis células devolve `0 6 2 8 1 4`, com espaços que o campo
 * recusa.
 */

const DISPLAY = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const CORPO = "'IBM Plex Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono','Courier New',Courier,monospace";

const PAGE = '#0B0B0B';
const CARD = '#171717';
const CHIP = '#232323';
const ACCENT = '#F5C518';
const INK = 'rgba(255,255,255,0.96)';
const MUTE = 'rgba(255,255,255,0.68)';
const FAINT = 'rgba(255,255,255,0.52)';
const LINE = 'rgba(255,255,255,0.07)';

/**
 * O bloco do código: o único elemento que a pessoa veio buscar.
 *
 * `padding-left` compensa o espaçamento entre letras — a última letra carrega
 * um espaço à direita que não existe à esquerda, e sem a compensação os seis
 * dígitos ficam visivelmente fora do centro da caixa.
 */
function blocoCodigo(codigo: string, minutos: number): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="background:${CHIP};border:1px solid ${LINE};border-radius:14px;
        padding:28px 20px 26px;text-align:center;">
      <div style="font-family:${CORPO};font-size:10.5px;font-weight:600;
          letter-spacing:0.16em;text-transform:uppercase;color:${FAINT};">Seu código</div>
      <div style="font-family:${MONO};font-size:40px;font-weight:500;
          letter-spacing:14px;padding-left:14px;color:${ACCENT};line-height:1.15;
          margin-top:14px;">${codigo}</div>
    </td></tr>
  </table>
  <div style="text-align:center;margin-top:14px;">
    <span style="display:inline-block;background:${CHIP};border-radius:999px;
        padding:6px 14px;font-family:${CORPO};font-size:12px;color:${FAINT};">
      Expira em ${minutos} minutos
    </span>
  </div>`;
}

/**
 * A moldura: página, faixa dourada, cartão, rodapé.
 *
 * A faixa de 3px no topo é o único lugar em que a marca ocupa área — o resto do
 * cartão é preto e texto. É ela que faz a mensagem ser reconhecível antes de
 * qualquer palavra ser lida.
 */
function moldura(sobretitulo: string, titulo: string, miolo: string, rodape: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="background:${PAGE};margin:0;padding:0;">
  <tr><td align="center" style="padding:48px 16px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="max-width:480px;">

      <tr><td style="background:${ACCENT};height:3px;line-height:3px;font-size:0;
          border-radius:18px 18px 0 0;">&nbsp;</td></tr>

      <tr><td style="background:${CARD};border:1px solid ${LINE};border-top:0;
          border-radius:0 0 18px 18px;padding:38px 36px 32px;">

        <div style="text-align:center;font-family:${DISPLAY};font-weight:900;
            font-size:12px;letter-spacing:0.3em;padding-left:0.3em;color:${FAINT};">VISTON</div>

        <div style="text-align:center;margin-top:34px;font-family:${CORPO};
            font-size:10.5px;font-weight:600;letter-spacing:0.16em;
            text-transform:uppercase;color:${ACCENT};">${sobretitulo}</div>

        <h1 style="margin:12px 0 0;text-align:center;font-family:${DISPLAY};
            font-weight:600;font-size:25px;line-height:1.24;letter-spacing:-0.015em;
            color:${INK};">${titulo}</h1>

        ${miolo}

        <div style="height:1px;background:${LINE};margin:32px 0 18px;"></div>

        <p style="margin:0;text-align:center;font-family:${CORPO};font-size:12px;
            line-height:1.65;color:${FAINT};">${rodape}</p>

        <p style="margin:14px 0 0;text-align:center;font-family:${DISPLAY};
            font-weight:600;font-size:11px;letter-spacing:0.14em;
            text-transform:uppercase;color:rgba(255,255,255,0.32);">
          Viston · Vistoria predial
        </p>

      </td></tr>
    </table>

  </td></tr>
</table>`;
}

/** Parágrafo do corpo: centrado, curto, e com medida que não estica. */
function paragrafo(texto: string): string {
  return `<p style="margin:14px auto 0;max-width:22rem;text-align:center;
      font-family:${CORPO};font-size:15px;line-height:1.6;color:${MUTE};">${texto}</p>`;
}

export function emailVerificacao(nome: string, codigo: string, minutos: number) {
  return {
    assunto: `${codigo} é o seu código de confirmação do Viston`,
    texto:
      `Olá, ${nome}.\n\n` +
      `Sua conta no Viston foi criada. Use o código abaixo no aplicativo para liberar o acesso.\n\n` +
      `    ${codigo}\n\n` +
      `Expira em ${minutos} minutos.\n\n` +
      `Se você não criou esta conta, ignore esta mensagem — sem confirmar, ela não dá acesso a nada.\n\n` +
      `Viston · Vistoria predial`,
    html: moldura(
      'Confirmação de conta',
      'Confirme seu e-mail',
      paragrafo(`Olá, ${escapar(nome)}. Sua conta foi criada — digite o código abaixo no aplicativo para liberar o acesso.`) +
        `<div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>` +
        blocoCodigo(codigo, minutos),
      'Se você não criou esta conta, ignore esta mensagem — sem confirmar, ela não dá acesso a nada.'
    ),
  };
}

export function emailRecuperacao(nome: string, codigo: string, minutos: number) {
  return {
    assunto: `${codigo} é o seu código para redefinir a senha do Viston`,
    texto:
      `Olá, ${nome}.\n\n` +
      `Recebemos um pedido para redefinir sua senha no Viston. Use o código abaixo no aplicativo para escolher uma nova.\n\n` +
      `    ${codigo}\n\n` +
      `Expira em ${minutos} minutos. Sua senha atual continua valendo até você definir outra.\n\n` +
      `Se não foi você que pediu, ignore esta mensagem. Ninguém troca sua senha sem este código.\n\n` +
      `Viston · Vistoria predial`,
    html: moldura(
      'Recuperação de senha',
      'Redefina sua senha',
      paragrafo(`Olá, ${escapar(nome)}. Recebemos um pedido para redefinir sua senha — digite o código abaixo para escolher uma nova.`) +
        `<div style="height:26px;line-height:26px;font-size:0;">&nbsp;</div>` +
        blocoCodigo(codigo, minutos) +
        paragrafo('Sua senha atual continua valendo até você definir outra.'),
      'Se não foi você que pediu, ignore esta mensagem. Ninguém troca sua senha sem este código.'
    ),
  };
}

/**
 * O nome vem do cadastro, e cadastro é campo aberto.
 *
 * Sem isto, um nome com `<script>` ou com uma tag de imagem entraria inteiro no
 * HTML da mensagem. O alvo aqui não é o navegador de quem recebe — cliente de
 * e-mail não roda script —, é o que a pessoa lê: um nome com marcação vira
 * layout quebrado, ou um link falso colado no meio de um e-mail legítimo nosso.
 *
 * A versão em texto puro não precisa disto: lá não há marcação para interpretar.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
