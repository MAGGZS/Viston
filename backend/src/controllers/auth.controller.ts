import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { managerService } from '../services/manager.service';
import { ok } from '../utils/response';

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
};
