import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { planAdminService } from '../services/planAdmin.service';
import { ok, created } from '../utils/response';

export const adminController = {
  async planSummary(req: AuthenticatedRequest, res: Response) {
    ok(res, await planAdminService.summary(req.params.managerId));
  },

  async grantPlan(req: AuthenticatedRequest, res: Response) {
    created(res, await planAdminService.grant(req.params.managerId, req.body, req.user));
  },

  async revokeGrant(req: AuthenticatedRequest, res: Response) {
    ok(res, await planAdminService.revoke(req.params.id, req.user));
  },

  async setSuspension(req: AuthenticatedRequest, res: Response) {
    ok(res, await planAdminService.setSuspension(req.params.managerId, req.body.suspended, req.user));
  },

  async setFreeze(req: AuthenticatedRequest, res: Response) {
    ok(res, await planAdminService.setFreeze(req.params.id, req.body.frozen, req.user));
  },
};
