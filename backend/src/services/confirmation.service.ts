import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { hasEmailProvider, resend } from '../lib/resend';
import { logger } from '../lib/logger';
import {
  emailTokenRepository,
  TokenOwner,
} from '../repositories/emailToken.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import {
  EmailDeliveryError,
  InvalidTokenError,
  TooManyEmailsError,
} from '../utils/errors';

const VALIDADE_HORAS = 24;
const UMA_HORA_MS = 3_600_000;
const MAX_POR_HORA = 5;

/**
 * O que fica no banco.
 *
 * sha256 e não bcrypt: o token já é 32 bytes de aleatoriedade do sistema, e não
 * uma senha que alguém escolheu. Não há dicionário para atacar, então o custo
 * do bcrypt aqui só atrasaria a confirmação sem comprar segurança nenhuma.
 */
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Um endereço só, escrito de um jeito só, em todo lugar do fluxo. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function corpoDoEmail(nome: string, url: string) {
  return `
      <div style="background:#111;padding:32px 0;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border-radius:12px;padding:32px;color:#e8e8e8;">
          <h1 style="margin:0 0 24px;font-size:20px;color:#e0b400;">Viston</h1>
          <p>Olá, ${nome}.</p>
          <p>Sua conta foi criada. Confirme este e-mail para liberar o acesso.</p>
          <p style="margin:24px 0;">
            <a href="${url}" style="background:#e0b400;color:#111;text-decoration:none;
               padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">
              Confirmar meu e-mail
            </a>
          </p>
          <p style="font-size:12px;color:#999;word-break:break-all;">
            Ou copie no navegador:<br>${url}
          </p>
          <p style="font-size:13px;color:#aaa;">O link expira em ${VALIDADE_HORAS} horas.</p>
          <p style="margin-top:32px;font-size:12px;color:#888;">
            Se você não criou esta conta, ignore esta mensagem.
          </p>
        </div>
      </div>`;
}

/**
 * Emite um link novo e manda.
 *
 * A ordem importa: conta os envios recentes, fecha os links abertos, grava o
 * hash do novo e só então envia. Se o envio falhar, o que sobra no banco é um
 * token que ninguém recebeu — inofensivo, e invalidado no próximo pedido.
 * Enviar antes de gravar seria o contrário: um link real na caixa de entrada
 * que o banco não reconhece.
 */
export async function enviarConfirmacao(owner: TokenOwner, nome: string, emailBruto: string) {
  const email = normalizeEmail(emailBruto);

  const recentes = await emailTokenRepository.countRecent(email, UMA_HORA_MS);
  if (recentes >= MAX_POR_HORA) throw new TooManyEmailsError();

  await emailTokenRepository.invalidateOpen(owner);

  const raw = randomBytes(32).toString('base64url');
  await emailTokenRepository.create({
    owner,
    email,
    token_hash: hashToken(raw),
    expires_at: new Date(Date.now() + VALIDADE_HORAS * UMA_HORA_MS),
  });

  const url = `${config.email.appUrl}/confirmar?token=${raw}`;

  // Sem provedor configurado — a máquina de quem desenvolve — o link vai para o
  // log em vez do e-mail. É o que torna o fluxo inteiro testável sem conta no
  // Resend. Em produção `RESEND_API_KEY` é obrigatória (ver config.ts), então
  // este desvio não existe lá.
  if (!hasEmailProvider()) {
    logger.warn({ url }, '[Confirmacao] Sem RESEND_API_KEY: link não enviado, só registrado');
    return;
  }

  const { error } = await resend().emails.send({
    from: config.email.from,
    to: email,
    subject: 'Confirme seu e-mail para acessar o Viston',
    html: corpoDoEmail(nome, url),
  });

  // O erro do Resend vai para o log e não para a resposta: ele diz coisas sobre
  // a conta de envio — cota estourada, domínio não verificado — que não são da
  // conta de quem está se cadastrando.
  if (error) {
    logger.error({ err: error }, '[Confirmacao] Envio falhou');
    throw new EmailDeliveryError();
  }
}

export const confirmationService = {
  /**
   * Consome o link e libera a conta.
   *
   * Não cria sessão de propósito: quem confirma pode estar noutro aparelho, ou
   * num link encaminhado. Liberar o acesso e mandar para o login é o que
   * garante que quem entra é quem sabe a senha.
   */
  async confirmar(tokenCru: string) {
    const token = await emailTokenRepository.consume(hashToken(tokenCru));
    if (!token) throw new InvalidTokenError();

    const agora = new Date();
    if (token.user_id) {
      await userRepository.update(token.user_id, { email_verified_at: agora });
    } else if (token.manager_id) {
      await managerRepository.update(token.manager_id, { email_verified_at: agora });
    }
  },
};

/**
 * A única resposta que o cadastro dá, em todos os caminhos.
 *
 * E-mail novo, e-mail que já tem conta, e-mail que caiu na armadilha do
 * honeypot: os três saem por aqui. Distinguir qualquer um deles transformaria o
 * formulário público num verificador de quais endereços têm conta no sistema.
 */
export const RESPOSTA_CADASTRO = {
  ok: true,
  mensagem:
    'Se este endereço estiver disponível, enviamos um link de confirmação. Verifique sua caixa de entrada.',
} as const;

/**
 * O e-mail está livre na *outra* tabela de conta?
 *
 * O sistema tem duas, e o login procura nas duas: o mesmo endereço nos dois
 * lugares tornaria a entrada ambígua. Antes isto era um 409 (`assertEmailIsFree`);
 * agora é uma resposta silenciosa, porque o 409 dizia demais.
 *
 * Ocupado é ocupado, confirmado ou não. A tentação aqui é recolher a conta não
 * confirmada do outro lado, que "não tem dado nenhum" — mas isso seria apagar a
 * conta de alguém durante a requisição de outra pessoa, apoiado numa invariante
 * que nada no banco garante. Quem ficar preso nesse caso raro sai dele com uma
 * mão humana, que é o preço certo a pagar.
 */
export async function outraTabelaLivre(
  kind: 'USER' | 'MANAGER',
  email: string
): Promise<boolean> {
  const outra = kind === 'USER' ? managerRepository : userRepository;
  return (await outra.findByEmail(email)) === null;
}

/**
 * Envia a partir do cadastro público, engolindo o teto por hora.
 *
 * O 429 é um oráculo aqui, e sozinho derruba a regra da resposta única. Ele só
 * dispara quando existem tokens recentes para o endereço — e tokens só existem
 * para conta nova ou não confirmada. Quem manda seis cadastros seguidos e vê o
 * sexto virar 429 acabou de provar que aquele e-mail *não* tem conta confirmada
 * no sistema, sem nunca ter recebido uma mensagem diferente das outras.
 *
 * Silenciar não custa nada a quem é de verdade: cinco links já saíram para essa
 * caixa na última hora, e o mais recente ainda vale. Em `/auth/reenviar` o 429
 * continua honesto — lá quem pergunta já provou saber a senha, e não descobre
 * nada que ainda não soubesse.
 *
 * `EMAIL_FALHOU` continua subindo. Ele também distingue caminhos, mas só
 * enquanto o provedor está fora do ar ou com a cota estourada — condição
 * barulhenta, temporária e visível para quem opera —, e em troca diz à pessoa
 * que o e-mail não vem e que vale tentar de novo. Calar isso seria mandá-la
 * esperar para sempre uma mensagem que não existe.
 */
export async function enviarConfirmacaoDeCadastro(
  owner: TokenOwner,
  nome: string,
  email: string
) {
  try {
    await enviarConfirmacao(owner, nome, email);
  } catch (err) {
    if (err instanceof TooManyEmailsError) {
      logger.warn({ owner }, '[Confirmacao] Teto por hora atingido no cadastro; resposta única mantida');
      return;
    }
    throw err;
  }
}
