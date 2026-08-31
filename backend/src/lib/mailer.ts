import { promises as dns } from 'node:dns';
import nodemailer, { Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import { config } from '../config';
import { logger } from '../lib/logger';
import { EmailDeliveryError } from '../utils/errors';

/**
 * O transporte de e-mail, único ponto do sistema que toca a senha do SMTP.
 *
 * Gmail e não um provedor de API porque o que decide isto é a entrega, não a
 * biblioteca: provedor de API recusa mandar para estranhos enquanto o domínio
 * do remetente não estiver verificado, e domínio próprio é o que o projeto não
 * tem. O Gmail já é um remetente verificado — do Google —, então entrega para
 * qualquer endereço no dia um.
 *
 * O preço é o teto: ~500 mensagens por dia numa conta comum, ~2.000 no
 * Workspace. Para um cadastro deste tamanho sobra; para uma campanha, não.
 */
let transporter: Transporter | null = null;

/**
 * O endereço IPv4 do servidor SMTP, resolvido aqui e não pelo Nodemailer.
 *
 * Esta função existe por um defeito que só aparecia em produção. O envio morria
 * em `connect ENETUNREACH 2607:f8b0:...:465` — endereço IPv6 —, porque o
 * container do Render não tem rota IPv6 de saída.
 *
 * A primeira tentativa de corrigir foi `dns.setDefaultResultOrder('ipv4first')`,
 * e ela não funcionou: o Nodemailer **não usa `dns.lookup`**. Ele resolve por
 * conta própria com `resolve4`/`resolve6` (ver `lib/shared/index.js`), e antes
 * disso passa por um `isFamilySupported`, que consulta as interfaces de rede da
 * máquina — se não encontra uma IPv4 não-interna, nem tenta pedir o registro A,
 * e sobra só IPv6. Nenhuma opção do transporte contorna isso: `family` sequer
 * chega ao `smtp-connection`.
 *
 * Resolver aqui e entregar o IP pronto tira o Nodemailer dessa decisão.
 */
async function resolverHostIPv4(): Promise<string> {
  const [ip] = await dns.resolve4(config.smtp.host);
  return ip;
}

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  const host = await resolverHostIPv4();

  /**
   * `servername` é lido pelo Nodemailer em tempo de execução
   * (`smtp-connection/index.js:84`, `this.options.servername`), mas não consta
   * nos tipos publicados do `SMTPPool.Options`. A interseção declara a lacuna
   * em vez de escondê-la atrás de um `as any`, que calaria também qualquer erro
   * de verdade no resto do objeto.
   */
  const opcoes: SMTPPool.Options & { servername?: string } = {
    host,
    /**
     * O nome verdadeiro, para o SNI e para a validação do certificado.
     *
     * Com `host` sendo um IP, o Nodemailer desligaria o SNI sozinho
     * (`net.isIP(host)` em `smtp-connection/index.js:84`) e o certificado do
     * Gmail deixaria de validar. Sem esta linha, trocar o hostname pelo IP
     * seria trocar um defeito de rede por um buraco de TLS.
     */
    servername: config.smtp.host,
    port: config.smtp.port,
    // 465 é TLS desde o primeiro byte; 587 começa em claro e sobe com STARTTLS.
    // A porta decide, e não uma segunda variável que pode discordar dela.
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.appPassword },

    /**
     * Falhar rápido em vez de pendurar.
     *
     * Sem estes tetos o pedido de código ficava 150 segundos preso antes de
     * devolver erro — o Nodemailer esperava o padrão dele, e quem clicou olhava
     * uma tela parada por dois minutos e meio. Dez segundos bastam para saber
     * que não vai conectar.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,

    // O pool reaproveita a conexão TLS: o aperto de mão com o Gmail custa mais
    // que a mensagem. Uma conexão de cada vez respeita o ritmo que ele aceita
    // sem reclamar.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  };

  transporter = nodemailer.createTransport(opcoes);
  return transporter;
}

/**
 * Descarta o transporte para o próximo envio resolver o IP de novo.
 *
 * O Google atende o SMTP por muitos endereços e os troca com frequência. Um IP
 * fixado na subida envelhece, e sem isto o processo insistiria num servidor que
 * saiu de rotação até alguém reiniciar o serviço.
 */
function descartarTransporte(): void {
  transporter?.close?.();
  transporter = null;
}

/**
 * Manda a mensagem, e transforma qualquer falha em `EMAIL_FALHOU`.
 *
 * O erro vai para o log e não para a resposta: ele diz coisas sobre a conta de
 * envio — senha de app revogada, cota do dia estourada, conexão recusada — que
 * não são da conta de quem está se cadastrando.
 */
export async function enviarEmail(para: string, assunto: string, html: string): Promise<void> {
  try {
    const t = await getTransporter();
    await t.sendMail({ from: config.smtp.from, to: para, subject: assunto, html });
  } catch (err) {
    logger.error({ err }, '[Mailer] Envio falhou');
    descartarTransporte();
    throw new EmailDeliveryError();
  }
}

/**
 * Confere as credenciais contra o servidor, sem mandar nada.
 *
 * Chamado na subida (ver `server.ts`). Senha de app errada ou revogada é a
 * falha mais provável aqui, e sem esta checagem ela só apareceria no primeiro
 * cadastro de alguém — em produção, na cara de um usuário. Falhar não derruba
 * o servidor: o resto da API não depende de e-mail, e ficar fora do ar inteiro
 * porque o SMTP recusou seria trocar um defeito por um pior.
 */
export async function verificarSmtp(): Promise<boolean> {
  try {
    const t = await getTransporter();
    await t.verify();
    logger.info({ host: config.smtp.host, user: config.smtp.user }, '[Mailer] SMTP pronto');
    return true;
  } catch (err) {
    logger.error({ err }, '[Mailer] SMTP indisponível — os e-mails vão falhar');
    descartarTransporte();
    return false;
  }
}
