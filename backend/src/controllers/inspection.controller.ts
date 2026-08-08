import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { inspectionService } from '../services/inspection.service';
import { buildingRepository } from '../repositories/building.repository';
import { ok, created } from '../utils/response';
import { NotFoundError } from '../utils/errors';
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
    const report = await inspectionService.submit(req.user.id, payload);
    created(res, report);
  },

  async findAll(req: AuthenticatedRequest, res: Response) {
    const parsed = inspectionFiltersSchema.parse(req.query);
    const filters = { ...parsed, page: parsed.page ?? 1, limit: parsed.limit ?? 20 };
    const result = await inspectionService.findAll(filters);
    ok(res, result);
  },

  async findById(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.findById(req.params.id);
    ok(res, report);
  },

  async getExcelUrl(req: AuthenticatedRequest, res: Response) {
    const result = await inspectionService.getExcelUrl(req.params.id);
    ok(res, result);
  },

  async getCalendar(req: AuthenticatedRequest, res: Response) {
    const params = calendarQuerySchema.parse(req.query);
    const result = await inspectionService.getCalendar(params);
    ok(res, result);
  },

  async getFloors(req: AuthenticatedRequest, res: Response) {
    const building = await buildingRepository.findById(req.params.id);
    if (!building) throw new NotFoundError('Prédio');
    const floors = await buildingRepository.getFloors(req.params.id);
    ok(res, { building, floors });
  },
};
