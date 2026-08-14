import { Response } from 'express';
import { FeedbackStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { feedbackService } from '../services/feedback.service';
import { ok, created, noContent } from '../utils/response';

export const feedbackController = {
  async create(req: AuthenticatedRequest, res: Response) {
    created(res, await feedbackService.create(req.user, req.body.message));
  },

  async listMine(req: AuthenticatedRequest, res: Response) {
    ok(res, await feedbackService.listMine(req.user));
  },

  /** Sem `status` na query, a caixa abre no que ainda não foi lido. */
  async findAll(req: AuthenticatedRequest, res: Response) {
    const status = (req.query.status as FeedbackStatus) ?? FeedbackStatus.PENDENTE;
    ok(res, await feedbackService.findAll(status));
  },

  async review(req: AuthenticatedRequest, res: Response) {
    ok(res, await feedbackService.review(req.params.id, req.body.status, req.user));
  },

  async discard(req: AuthenticatedRequest, res: Response) {
    await feedbackService.discard(req.params.id, req.user);
    noContent(res);
  },
};
