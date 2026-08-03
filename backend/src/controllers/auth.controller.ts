import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { ok } from '../utils/response';

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body.email, req.body.password);
    ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.body.refresh_token);
    ok(res, result);
  },
};
