import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { userService } from '../services/user.service';
import { ok, noContent } from '../utils/response';

export const userController = {
  /**
   * Cadastro público. 200 e não 201, e sem a conta no corpo.
   *
   * 201 "Created" seria a resposta honesta de um dos caminhos, e por isso
   * mesmo não serve: o código de status contaria o que a mensagem se recusa a
   * contar. Ver `RESPOSTA_CADASTRO`.
   */
  async create(req: AuthenticatedRequest, res: Response) {
    ok(res, await userService.create(req.body));
  },

  async findAll(req: AuthenticatedRequest, res: Response) {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const result = await userService.findAll(page, limit);
    ok(res, result);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const user = await userService.update(req.params.id, req.body);
    ok(res, user);
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    await userService.remove(req.params.id, req.user.id);
    noContent(res);
  },

  async getMe(req: AuthenticatedRequest, res: Response) {
    const user = await userService.getProfile(req.user.id);
    ok(res, user);
  },

  async updateMe(req: AuthenticatedRequest, res: Response) {
    const user = await userService.updateMe(req.user.id, req.body);
    ok(res, user);
  },

  async updateAvatar(req: AuthenticatedRequest, res: Response) {
    const user = await userService.updateAvatar(req.user.id, req.body.image);
    ok(res, user);
  },

  async removeAvatar(req: AuthenticatedRequest, res: Response) {
    const user = await userService.removeAvatar(req.user.id);
    ok(res, user);
  },

  async changePassword(req: AuthenticatedRequest, res: Response) {
    await userService.changePassword(
      req.user.id,
      req.body.current_password,
      req.body.new_password
    );
    noContent(res);
  },

  async deleteMe(req: AuthenticatedRequest, res: Response) {
    await userService.softDelete(req.user.id);
    noContent(res);
  },
};
