import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { ownershipService } from '../services/ownership.service';
import { ok, created } from '../utils/response';

export const ownershipController = {
  async request(req: AuthenticatedRequest, res: Response) {
    created(res, await ownershipService.request(req.params.id, req.body.to_manager_id, req.user));
  },

  async listMine(req: AuthenticatedRequest, res: Response) {
    ok(res, await ownershipService.listMine(req.user));
  },

  async listByBuilding(req: AuthenticatedRequest, res: Response) {
    ok(res, await ownershipService.listByBuilding(req.params.id));
  },

  async respond(req: AuthenticatedRequest, res: Response) {
    ok(res, await ownershipService.respond(req.params.id, req.body.accept, req.user));
  },
};
