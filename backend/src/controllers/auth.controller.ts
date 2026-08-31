import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { confirmationService, RESPOSTA_CADASTRO } from '../services/confirmation.service';
import { passwordService, RESPOSTA_RECUPERACAO } from '../services/password.service';
import { ok, noContent } from '../utils/response';

export const authController = {
  /**
   * O perfil de quem está logado, seja qual for o tipo da conta.
   *
   * Existe para o app não precisar saber em que tabela ele mora antes de
   * perguntar: no carregamento da página só existe o token, e é ele que diz.
   * A resposta sempre traz `kind` e `memberships`, nos dois casos.
   */
  async me(req: AuthenticatedRequest, res: Response) {
    if (req.user.kind === 'MANAGER') {
      ok(res, await managerService.getProfile(req.user.id));
      return;
    }

    const user = await userService.getProfile(req.user.id);
    ok(res, { ...user, kind: 'USER' as const });
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body.email, req.body.password);
    ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.body.refresh_token);
    ok(res, result);
  },

  /**
   * Confere o código do e-mail e libera a conta.
   *
   * Sem sessão na resposta: quem digitou o código pode estar noutro aparelho.
   * Liberar o acesso e mandar para o login mantém a senha como a única porta.
   */
  async confirmar(req: Request, res: Response) {
    await confirmationService.confirmar(req.body.email, req.body.code);
    ok(res, { ok: true });
  },

  /** Esqueci minha senha. Resposta única — ver `RESPOSTA_RECUPERACAO`. */
  async esqueciSenha(req: Request, res: Response) {
    ok(res, await passwordService.solicitar(req.body.email));
  },

  /**
   * Confere o código de redefinição sem gastá-lo.
   *
   * A tela usa isto para não deixar a pessoa escolher uma senha nova e só então
   * descobrir que errou o código.
   */
  async verificarCodigoSenha(req: Request, res: Response) {
    await passwordService.verificar(req.body.email, req.body.code);
    ok(res, { ok: true });
  },

  /** Troca a senha e derruba as sessões abertas da conta. */
  async redefinirSenha(req: Request, res: Response) {
    await passwordService.redefinir(req.body.email, req.body.code, req.body.new_password);
    ok(res, { ok: true });
  },

  /**
   * Reenvia o link. Sempre a mesma resposta, tenha reenviado ou não — ver
   * `authService.reenviarConfirmacao`.
   */
  async reenviar(req: Request, res: Response) {
    await authService.reenviarConfirmacao(req.body.email, req.body.password);
    ok(res, RESPOSTA_CADASTRO);
  },

  /**
   * Encerra as sessões da conta e grava a saída na trilha.
   *
   * 204 sem corpo: não há o que devolver a quem acabou de sair, e o app não
   * precisa esperar nada além da confirmação para limpar o armazenamento.
   */
  async logout(req: AuthenticatedRequest, res: Response) {
    await authService.logout(req.user);
    noContent(res);
  },
};
