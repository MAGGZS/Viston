import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { TokenPurpose } from '@prisma/client';
import { enviarEmail } from '../lib/mailer';
import { logger } from '../lib/logger';
import { emailVerificacao, emailRecuperacao } from '../templates/email';
import {
  emailTokenRepository,
  MAX_TENTATIVAS,
  TokenOwner,
} from '../repositories/emailToken.repository';
import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { EmailDeliveryError, InvalidCodeError, TooManyEmailsError } from '../utils/errors';

/** Quanto tempo um código vale. Curto de propósito — ver `gerarCodigo`. */
const VALIDADE_MINUTOS = 10;
/** Espera mínima entre dois pedidos do mesmo endereço. */
export const INTERVALO_REENVIO_SEG = 60;
/** Teto de códigos por endereço por hora. */
const MAX_POR_HORA = 5;

const UMA_HORA_MS = 3_600_000;

/**
 * O que fica no banco.
 *
 * sha256 e não bcrypt: o espaço é de um milhão de valores, e bcrypt aqui só
 * atrasaria cada verificação sem mudar a conta — quem protege o código é o teto
 * de cinco tentativas, não o custo do hash. Contra quem já tem o banco na mão,
 * nenhum dos dois salva seis dígitos.
 */
export const hashCodigo = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Um endereço só, escrito de um jeito só, em todo lugar do fluxo. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * O código de seis dígitos.
 *
 * `randomInt` do node:crypto, e não `Math.random` nem `% 1000000`: o primeiro
 * não serve para nada que precise ser imprevisível, e o resto de uma divisão
 * sobre bytes aleatórios distorce a distribuição para os primeiros valores.
 * `randomInt` faz a rejeição correta e sai uniforme.
 *
 * `padStart` porque 000042 é um código tão válido quanto 731905, e cortar os
 * zeros à esquerda tiraria dez por cento das combinações.
 */
function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Compara dois hashes hexadecimais sem entregar pelo tempo onde eles divergem.
 *
 * Um `===` sai no primeiro caractere diferente, e a diferença entre "errou no
 * primeiro" e "errou no último" é mensurável por quem tem paciência. Contra
 * seis dígitos, essa fresta encurtaria a busca de um milhão para algumas
 * dezenas de tentativas por posição.
 */
function hashesIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Emite um código e manda.
 *
 * A ordem importa: confere os tetos, fecha os códigos abertos, grava o hash do
 * novo e só então envia. Se o envio falhar, o que sobra no banco é um código
 * que ninguém recebeu — inofensivo, e fechado no próximo pedido. Enviar antes
 * de gravar seria o contrário: um código real na caixa de entrada que o banco
 * não reconhece.
 */
export async function enviarCodigo(
  owner: TokenOwner,
  purpose: TokenPurpose,
  nome: string,
  emailBruto: string
): Promise<void> {
  const email = normalizeEmail(emailBruto);

  // Dois tetos, e não um: o do intervalo segura o dedo nervoso no botão de
  // reenviar, o da hora segura quem quer usar o sistema para inundar a caixa
  // de outra pessoa. Um sozinho deixa passar o caso do outro.
  const ultimo = await emailTokenRepository.lastSentAt(email, purpose);
  if (ultimo && Date.now() - ultimo.getTime() < INTERVALO_REENVIO_SEG * 1000) {
    throw new TooManyEmailsError();
  }

  const recentes = await emailTokenRepository.countRecent(email, purpose, UMA_HORA_MS);
  if (recentes >= MAX_POR_HORA) throw new TooManyEmailsError();

  await emailTokenRepository.invalidateOpen(owner, purpose);

  const codigo = gerarCodigo();
  await emailTokenRepository.create({
    owner,
    purpose,
    email,
    code_hash: hashCodigo(codigo),
    expires_at: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
  });

  const { assunto, html, texto } =
    purpose === 'PASSWORD_RESET'
      ? emailRecuperacao(nome, codigo, VALIDADE_MINUTOS)
      : emailVerificacao(nome, codigo, VALIDADE_MINUTOS);

  await enviarEmail(email, assunto, html, texto);
}

/**
 * Confere o código e, se pedido, o gasta.
 *
 * `consumir: false` existe para a recuperação de senha poder validar o código
 * na tela dele antes de pedir a senha nova — sem isso, quem digitasse o código
 * errado só descobriria depois de escolher a senha.
 *
 * Um erro só para tudo: e-mail sem código aberto, código errado, vencido,
 * tentativas esgotadas. Separá-los diria a quem chuta qual das quatro coisas
 * ele acertou.
 */
export async function verificarCodigo(
  emailBruto: string,
  purpose: TokenPurpose,
  codigo: string,
  opcoes: { consumir: boolean }
): Promise<{ user_id: string | null; manager_id: string | null }> {
  const email = normalizeEmail(emailBruto);
  const registro = await emailTokenRepository.findOpen(email, purpose);

  if (
    !registro ||
    !registro.code_hash ||
    registro.expires_at <= new Date() ||
    registro.attempts >= MAX_TENTATIVAS
  ) {
    throw new InvalidCodeError();
  }

  if (!hashesIguais(hashCodigo(codigo), registro.code_hash)) {
    // O chute é contado mesmo quando o registro já vai morrer: é o contador que
    // fecha a porta, e ele precisa chegar ao teto para fechá-la.
    await emailTokenRepository.registerFailure(registro.id, registro.attempts);
    throw new InvalidCodeError();
  }

  if (opcoes.consumir && !(await emailTokenRepository.consume(registro.id))) {
    // Perdeu a corrida para outra submissão do mesmo código.
    throw new InvalidCodeError();
  }

  return { user_id: registro.user_id, manager_id: registro.manager_id };
}

export const confirmationService = {
  /**
   * Confirma o e-mail e libera a conta.
   *
   * Não cria sessão de propósito: quem digita o código pode estar noutro
   * aparelho. Liberar o acesso e mandar para o login é o que mantém a senha
   * como a única porta.
   */
  async confirmar(email: string, codigo: string): Promise<void> {
    const dono = await verificarCodigo(email, 'EMAIL_VERIFY', codigo, { consumir: true });

    const agora = new Date();
    if (dono.user_id) {
      await userRepository.update(dono.user_id, { email_verified_at: agora });
    } else if (dono.manager_id) {
      await managerRepository.update(dono.manager_id, { email_verified_at: agora });
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
    'Se este endereço estiver disponível, enviamos um código de confirmação. Verifique sua caixa de entrada.',
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
 * Envia a partir do cadastro público, engolindo os tetos de reenvio.
 *
 * O 429 é um oráculo aqui, e sozinho derruba a regra da resposta única. Ele só
 * dispara quando existem códigos recentes para o endereço — e códigos só
 * existem para conta nova ou não confirmada. Quem manda seis cadastros seguidos
 * e vê o sexto virar 429 acabou de provar que aquele e-mail *não* tem conta
 * confirmada no sistema, sem nunca ter recebido uma mensagem diferente.
 *
 * Silenciar não custa nada a quem é de verdade: já saíram códigos para essa
 * caixa, e o mais recente ainda vale. Em `/auth/reenviar` o 429 continua
 * honesto — lá quem pergunta já provou saber a senha.
 *
 * `EMAIL_FALHOU` é engolido pela mesma razão, e essa parte estava errada na
 * primeira versão. O raciocínio era que o 502 só distingue caminhos enquanto o
 * provedor está fora do ar, e que em troca ele diz à pessoa que o e-mail não vem.
 * Só que ele também só *dispara* quando houve tentativa de envio — ou seja,
 * quando a conta é nova ou não confirmada. Com o servidor de e-mail fora, o
 * formulário passou a responder 502 para endereço com conta e 200 para
 * endereço sem conta, que é exatamente o verificador que este desenho existe
 * para impedir. Foi visto em produção, não em teoria.
 *
 * Quem precisa saber que o envio falhou tem por onde: o botão de reenviar, que
 * exige a senha, e o log, que grita. A tela do cadastro não é lugar para essa
 * informação, porque ali qualquer diferença é uma resposta a mais do que se
 * deve dar.
 */
export async function enviarConfirmacaoDeCadastro(
  owner: TokenOwner,
  nome: string,
  email: string
): Promise<void> {
  try {
    await enviarCodigo(owner, 'EMAIL_VERIFY', nome, email);
  } catch (err) {
    if (err instanceof TooManyEmailsError) {
      logger.warn({ owner }, '[Confirmacao] Teto de reenvio no cadastro; resposta única mantida');
      return;
    }
    if (err instanceof EmailDeliveryError) {
      logger.error({ owner }, '[Confirmacao] Envio falhou no cadastro; resposta única mantida');
      return;
    }
    throw err;
  }
}
