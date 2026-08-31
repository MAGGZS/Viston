import { userRepository } from '../repositories/user.repository';
import { managerRepository } from '../repositories/manager.repository';
import { hashPassword } from '../utils/password';
import { logger } from '../lib/logger';
import { EmailDeliveryError, TooManyEmailsError } from '../utils/errors';
import { enviarCodigo, normalizeEmail, verificarCodigo } from './confirmation.service';

/**
 * A resposta de "esqueci minha senha", igual em todos os caminhos.
 *
 * Endereço com conta, endereço sem conta, conta apagada: os três saem daqui. É
 * a mesma regra do cadastro, e pela mesma razão — este formulário é público, e
 * uma resposta diferente por caminho o transformaria num verificador de quais
 * e-mails têm conta.
 */
export const RESPOSTA_RECUPERACAO = {
  ok: true,
  mensagem:
    'Se este endereço tiver uma conta, enviamos um código para redefinir a senha. Verifique sua caixa de entrada.',
} as const;

/** Acha a conta nas duas tabelas — mesma porta única do login. */
async function acharConta(email: string) {
  const user = await userRepository.findByEmail(email);
  if (user) return { kind: 'USER' as const, conta: user };

  const manager = await managerRepository.findByEmail(email);
  if (manager) return { kind: 'MANAGER' as const, conta: manager };

  return null;
}

export const passwordService = {
  /**
   * Manda o código de redefinição, se houver conta.
   *
   * Conta inexistente, apagada ou nunca confirmada não recebe nada — e quem
   * pediu não fica sabendo de nenhum dos três casos.
   *
   * Conta não confirmada fica de fora de propósito: quem nunca provou ser dono
   * do endereço não tem senha a recuperar, e mandar código de redefinição para
   * ali seria oferecer um segundo caminho para tomar a conta antes do primeiro
   * ter sido percorrido. Essa pessoa termina o cadastro, que é o caminho dela.
   */
  async solicitar(emailBruto: string): Promise<typeof RESPOSTA_RECUPERACAO> {
    const email = normalizeEmail(emailBruto);
    const achado = await acharConta(email);

    if (!achado || achado.conta.status === 'DELETED' || !achado.conta.email_verified_at) {
      return RESPOSTA_RECUPERACAO;
    }

    try {
      await enviarCodigo(
        { kind: achado.kind, id: achado.conta.id },
        'PASSWORD_RESET',
        achado.conta.name,
        email
      );
    } catch (err) {
      // Mesmo raciocínio do cadastro, e os dois erros pela mesma razão: aqui só
      // se tenta enviar quando a conta existe, então tanto o 429 quanto o 502
      // contariam que ela existe. Visto em produção, e não em teoria: com o
      // envio fora do ar, este endpoint respondia 502 para quem tem conta e 200
      // para quem não tem.
      if (err instanceof TooManyEmailsError) {
        logger.warn({ email }, '[Senha] Teto de reenvio; resposta única mantida');
        return RESPOSTA_RECUPERACAO;
      }
      if (err instanceof EmailDeliveryError) {
        logger.error({ email }, '[Senha] Envio falhou; resposta única mantida');
        return RESPOSTA_RECUPERACAO;
      }
      throw err;
    }

    return RESPOSTA_RECUPERACAO;
  },

  /**
   * Confere o código sem gastá-lo.
   *
   * Existe para a tela poder validar antes de pedir a senha nova: sem isto,
   * quem digitasse o código errado só descobriria depois de escolher a senha,
   * e teria de escolher outra vez. O chute errado conta no teto do mesmo jeito.
   */
  async verificar(email: string, codigo: string): Promise<void> {
    await verificarCodigo(email, 'PASSWORD_RESET', codigo, { consumir: false });
  },

  /**
   * Troca a senha e derruba tudo que estava aberto.
   *
   * O código é conferido de novo aqui, e é aqui que ele é gasto: a validação da
   * tela anterior não autoriza nada sozinha, senão bastaria pular aquela tela.
   *
   * `bumpTokenVersion` no fim é o que faz a troca valer. Quem trocou a senha
   * porque desconfia de alguém precisa que as sessões daquele alguém morram —
   * sem isso, o refresh token que já estava na mão dele seguiria valendo por
   * sete dias, e a troca teria sido teatro.
   */
  async redefinir(email: string, codigo: string, novaSenha: string): Promise<void> {
    const dono = await verificarCodigo(email, 'PASSWORD_RESET', codigo, { consumir: true });
    const password_hash = await hashPassword(novaSenha);

    if (dono.user_id) {
      await userRepository.update(dono.user_id, { password_hash });
      await userRepository.bumpTokenVersion(dono.user_id);
    } else if (dono.manager_id) {
      await managerRepository.update(dono.manager_id, { password_hash });
      await managerRepository.bumpTokenVersion(dono.manager_id);
    }
  },
};
