import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { visibleBuildingIds } from '../middlewares/buildingAccess';
import { inspectionService } from '../services/inspection.service';
import { ok, created, noContent } from '../utils/response';
import {
  inspectionFiltersSchema,
  calendarQuerySchema,
  submitInspectionSchema,
  SubmitInspectionPayload,
} from '../validators/inspection.validator';

export const inspectionController = {
  async submit(req: AuthenticatedRequest, res: Response) {
    // Parse aqui (e não só no middleware) para aplicar os defaults do schema
    const payload = submitInspectionSchema.parse(req.body) as SubmitInspectionPayload;
    const report = await inspectionService.submit(req.user, payload);
    created(res, report);
  },

  async findAll(req: AuthenticatedRequest, res: Response) {
    const parsed = inspectionFiltersSchema.parse(req.query);
    const filters = { ...parsed, page: parsed.page ?? 1, limit: parsed.limit ?? 20 };
    const result = await inspectionService.findAll(filters, await visibleBuildingIds(req.user));
    ok(res, result);
  },

  async findById(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.findById(req.params.id, req.user);
    ok(res, report);
  },

  async remove(req: AuthenticatedRequest, res: Response) {
    await inspectionService.remove(req.params.id, req.user);
    noContent(res);
  },

  async getExcelUrl(req: AuthenticatedRequest, res: Response) {
    const result = await inspectionService.getExcelUrl(req.params.id, req.user);
    ok(res, result);
  },

  async generateExcel(req: AuthenticatedRequest, res: Response) {
    const result = await inspectionService.generateExcel(req.params.id, req.user);
    ok(res, result);
  },

  async getCalendar(req: AuthenticatedRequest, res: Response) {
    const params = calendarQuerySchema.parse(req.query);
    const result = await inspectionService.getCalendar(params, await visibleBuildingIds(req.user));
    ok(res, result);
  },
};
