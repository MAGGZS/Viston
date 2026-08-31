import { config } from '../config';
import { logger } from '../lib/logger';
import { EmailDeliveryError } from '../utils/errors';

/**
 * O envio de e-mail, único ponto do sistema que toca a chave do provedor.
 *
 * Brevo por HTTPS, e não SMTP, por uma razão medida e não teórica: o Render
 * bloqueia saída SMTP. As portas 465 e 587 foram testadas em produção e as duas
 * deram `ETIMEDOUT` no `CONN` — nenhuma configuração de cliente contorna um
 * pacote que não sai da máquina. A API fala na 443, que é por onde o app já
 * conversa com o Supabase e com a Vercel.
 *
 * Brevo e não Resend porque provedor de API costuma exigir domínio verificado
 * para entregar a estranhos, e domínio próprio é o que o projeto não tem. A
 * Brevo aceita verificar um *endereço* — `viston.team@gmail.com` —, e a partir
 * daí entrega para qualquer destinatário. Teto de 300 mensagens por dia no
 * plano gratuito.
 *
 * Sem SDK: são duas chamadas HTTP, e o `fetch` do Node 22 dá conta. Uma
 * dependência a mais aqui seria uma superfície a mais para um `POST`.
 */
const API = 'https://api.brevo.com/v3';

/** Dez segundos bastam para saber que o provedor não vai responder. */
const TIMEOUT_MS = 10_000;

function cabecalhos() {
  return {
    'api-key': config.email.apiKey,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

/**
 * Manda a mensagem, e transforma qualquer falha em `EMAIL_FALHOU`.
 *
 * O corpo do erro vai para o log e não para a resposta: ele diz coisas sobre a
 * conta de envio — chave revogada, remetente não verificado, cota do dia
 * estourada — que não são da conta de quem está se cadastrando.
 */
export async function enviarEmail(para: string, assunto: string, html: string): Promise<void> {
  try {
    const resposta = await fetch(`${API}/smtp/email`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({
        sender: { name: config.email.fromName, email: config.email.from },
        to: [{ email: para }],
        subject: assunto,
        htmlContent: html,
      }),
      // Sem isto o `fetch` espera o padrão do Node, e o pedido de código ficaria
      // preso enquanto quem clicou olha uma tela parada.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resposta.ok) {
      // O texto do erro da Brevo diz qual é o problema em uma linha; sem ele o
      // log teria só o número, e "400" não conserta nada às três da manhã.
      const detalhe = await resposta.text().catch(() => '');
      logger.error(
        { status: resposta.status, detalhe: detalhe.slice(0, 500) },
        '[Mailer] Provedor recusou a mensagem'
      );
      throw new EmailDeliveryError();
    }
  } catch (err) {
    if (err instanceof EmailDeliveryError) throw err;
    logger.error({ err }, '[Mailer] Envio falhou');
    throw new EmailDeliveryError();
  }
}

/**
 * Confere a chave contra o provedor, sem mandar nada.
 *
 * Chamado na subida (ver `server.ts`). Chave revogada ou copiada errada é a
 * falha mais provável, e sem esta checagem ela só apareceria no primeiro
 * cadastro de alguém — em produção, na cara de um usuário.
 *
 * Falhar não derruba o servidor: o resto da API não depende de e-mail, e ficar
 * fora do ar inteiro porque o provedor recusou seria trocar um defeito por um
 * pior. O que ela faz é gritar no log, na hora certa.
 */
export async function verificarProvedorEmail(): Promise<boolean> {
  try {
    const resposta = await fetch(`${API}/account`, {
      headers: cabecalhos(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      logger.error(
        { status: resposta.status, detalhe: detalhe.slice(0, 500) },
        '[Mailer] Provedor de e-mail indisponível — os e-mails vão falhar'
      );
      return false;
    }

    logger.info({ remetente: config.email.from }, '[Mailer] Provedor de e-mail pronto');
    return true;
  } catch (err) {
    logger.error({ err }, '[Mailer] Provedor de e-mail indisponível — os e-mails vão falhar');
    return false;
  }
}
