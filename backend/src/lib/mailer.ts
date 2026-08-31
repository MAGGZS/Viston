import nodemailer, { Transporter } from 'nodemailer';
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
 *
 * `pool: true` porque cada envio abriria uma conexão TLS nova com o Gmail, e o
 * aperto de mão custa mais que a mensagem. O pool reaproveita, e o limite de
 * um envio por vez respeita o ritmo que o Gmail aceita sem reclamar.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    // 465 é TLS desde o primeiro byte; 587 começa em claro e sobe com STARTTLS.
    // A porta decide, e não uma segunda variável que pode discordar dela.
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.appPassword },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });

  return transporter;
}

/**
 * Manda a mensagem, e transforma qualquer falha em `EMAIL_FALHOU`.
 *
 * O erro do SMTP vai para o log e não para a resposta: ele diz coisas sobre a
 * conta de envio — senha de app revogada, cota do dia estourada, conexão
 * recusada — que não são da conta de quem está se cadastrando.
 */
export async function enviarEmail(para: string, assunto: string, html: string): Promise<void> {
  try {
    await getTransporter().sendMail({
      from: config.smtp.from,
      to: para,
      subject: assunto,
      html,
    });
  } catch (err) {
    logger.error({ err }, '[Mailer] Envio falhou');
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
    await getTransporter().verify();
    logger.info({ host: config.smtp.host, user: config.smtp.user }, '[Mailer] SMTP pronto');
    return true;
  } catch (err) {
    logger.error({ err }, '[Mailer] SMTP indisponível — os e-mails vão falhar');
    return false;
  }
}
