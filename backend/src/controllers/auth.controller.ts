import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { confirmationService, RESPOSTA_CADASTRO } from '../services/confirmation.service';
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
   * Consome o link do e-mail e libera a conta.
   *
   * Sem sessão na resposta: quem clicou pode estar noutro aparelho, ou num link
   * encaminhado. Liberar o acesso e mandar para o login é o que mantém a senha
   * como a única porta.
   */
  async confirmar(req: Request, res: Response) {
    await confirmationService.confirmar(req.body.token);
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
