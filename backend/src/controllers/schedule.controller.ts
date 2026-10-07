import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { scheduleService } from '../services/schedule.service';
import { supervisorOverview } from '../services/supervisor.service';
import { notificationService } from '../services/notification.service';
import { created, noContent, ok } from '../utils/response';
import {
  notificationsQuerySchema,
  overviewQuerySchema,
  scheduleListQuerySchema,
  suggestionQuerySchema,
} from '../validators/schedule.validator';

/**
 * A agenda de vistorias e o sino.
 *
 * As queries são lidas aqui com o schema, como no painel analítico: o
 * `validate` só reescreve o corpo, e a query do Express é de leitura.
 */
export const scheduleController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const query = scheduleListQuerySchema.parse(req.query);
    ok(res, await scheduleService.list(req.params.id, req.user, req.buildingRole ?? undefined, query));
  },

  async create(req: AuthenticatedRequest, res: Response) {
    created(res, await scheduleService.create(req.params.id, req.user, req.body));
  },

  async update(req: AuthenticatedRequest, res: Response) {
    ok(res, await scheduleService.update(req.params.id, req.params.scheduleId, req.user, req.body));
  },

  async suggestion(req: AuthenticatedRequest, res: Response) {
    const query = suggestionQuerySchema.parse(req.query);
    ok(res, await scheduleService.suggestion(req.params.id, query));
  },

  async overview(req: AuthenticatedRequest, res: Response) {
    const query = overviewQuerySchema.parse(req.query);
    ok(res, await supervisorOverview(req.params.id, query));
  },

  async mine(req: AuthenticatedRequest, res: Response) {
    const query = scheduleListQuerySchema.pick({ month: true, year: true }).parse(req.query);
    ok(res, await scheduleService.mine(req.user, query));
  },

  async notifications(req: AuthenticatedRequest, res: Response) {
    const { limit } = notificationsQuerySchema.parse(req.query);
    ok(res, await notificationService.list(req.user, limit));
  },

  async readNotification(req: AuthenticatedRequest, res: Response) {
    await notificationService.markRead(req.user, req.params.id);
    noContent(res);
  },

  async readAllNotifications(req: AuthenticatedRequest, res: Response) {
    await notificationService.markAllRead(req.user);
    noContent(res);
  },
};
