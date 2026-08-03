import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { inspectionService } from '../services/inspection.service';
import { buildingRepository } from '../repositories/building.repository';
import { ok, created } from '../utils/response';
import { NotFoundError } from '../utils/errors';
import { inspectionFiltersSchema, calendarQuerySchema } from '../validators/inspection.validator';

export const inspectionController = {
  async start(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.start(
      req.user.id,
      req.body.building_id,
      req.body.floor_ids
    );
    created(res, report);
  },

  async saveFloorForm(req: AuthenticatedRequest, res: Response) {
    const entry = await inspectionService.saveFloorForm(
      req.params.id,
      req.params.floorId,
      req.body,
      req.user.id
    );
    ok(res, entry);
  },

  async finish(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.finish(req.params.id, req.user.id);
    ok(res, report);
  },

  async findAll(req: AuthenticatedRequest, res: Response) {
    const filters = inspectionFiltersSchema.parse(req.query);
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

  async syncGoogleForms(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.manualSyncGoogleForms(req.params.id, req.user.id);
    ok(res, report);
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
