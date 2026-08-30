import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { managerService } from '../services/manager.service';
import { ok, noContent } from '../utils/response';
import { ForbiddenError } from '../utils/errors';

/** As rotas de `/managers/me` só existem para quem entrou como gestor. */
function asManager(req: AuthenticatedRequest) {
  if (req.user.kind !== 'MANAGER') {
    throw new ForbiddenError('Esta área é da conta de gestor');
  }
  return req.user.id;
}

export const managerController = {
  /** Cadastro público de gestor — 200 e resposta única, ver `userController.create`. */
  async create(req: AuthenticatedRequest, res: Response) {
    ok(res, await managerService.create(req.body));
  },

  async findAll(req: AuthenticatedRequest, res: Response) {
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    ok(res, await managerService.findAll(page, limit));
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    await managerService.remove(req.params.id);
    noContent(res);
  },

  async getMe(req: AuthenticatedRequest, res: Response) {
    ok(res, await managerService.getProfile(asManager(req)));
  },

  async updateMe(req: AuthenticatedRequest, res: Response) {
    ok(res, await managerService.updateMe(asManager(req), req.body));
  },

  async updateAvatar(req: AuthenticatedRequest, res: Response) {
    ok(res, await managerService.updateAvatar(asManager(req), req.body.image));
  },

  async removeAvatar(req: AuthenticatedRequest, res: Response) {
    ok(res, await managerService.removeAvatar(asManager(req)));
  },

  async changePassword(req: AuthenticatedRequest, res: Response) {
    await managerService.changePassword(
      asManager(req),
      req.body.current_password,
      req.body.new_password
    );
    noContent(res);
  },

  async deleteMe(req: AuthenticatedRequest, res: Response) {
    await managerService.softDelete(asManager(req));
    noContent(res);
  },
};
