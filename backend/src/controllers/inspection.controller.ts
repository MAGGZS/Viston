import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { visibleBuildingIds } from '../middlewares/buildingAccess';
import { inspectionService } from '../services/inspection.service';
import { ok, created, noContent } from '../utils/response';
import {
  inspectionFiltersSchema,
  calendarQuerySchema,
  SubmitInspectionPayload,
} from '../validators/inspection.validator';
import { ValidationError } from '../utils/errors';

/**
 * A chave desta tentativa de envio, se o app mandou uma.
 *
 * Formato conferido antes de virar chave de busca: é texto do cliente, e vai
 * para uma coluna com unique. Um UUID cabe em 36 caracteres; o teto e o
 * alfabeto restrito cortam o resto.
 */
function submissionKeyOf(req: AuthenticatedRequest): string | undefined {
  const raw = req.header('Idempotency-Key');
  if (!raw) return undefined;

  const key = raw.trim();
  if (!/^[A-Za-z0-9._-]{8,64}$/.test(key)) {
    throw new ValidationError('Idempotency-Key inválida');
  }

  return key;
}

export const inspectionController = {
  async submit(req: AuthenticatedRequest, res: Response) {
    // O corpo já vem validado pelo middleware `validate`, com os defaults do
    // schema aplicados — ele reescreve `req.body` com o resultado do parse.
    const report = await inspectionService.submit(
      req.user,
      req.body as SubmitInspectionPayload,
      submissionKeyOf(req)
    );
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

  /** O relatório completo do dia daquela vistoria — a unidade virou o dia. */
  async getDayReport(req: AuthenticatedRequest, res: Response) {
    const report = await inspectionService.getDayReport(req.params.id, req.user);
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
