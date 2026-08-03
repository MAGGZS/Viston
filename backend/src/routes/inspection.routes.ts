import { Router, Request, Response, NextFunction } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { authenticate, AuthenticatedRequest } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { startInspectionSchema, floorFormSchema } from '../validators/inspection.validator';

const router = Router();
const auth = authenticate as (req: Request, res: Response, next: NextFunction) => void;
const inspectorOnly = authorize('ADMIN', 'INSPECTOR') as (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
const anyRole = authorize('ADMIN', 'INSPECTOR', 'VIEWER') as (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;

// ── Buildings ─────────────────────────────────────────────────────────────────
router.get(
  '/buildings/:id/floors',
  auth, anyRole,
  inspectionController.getFloors as (req: AuthenticatedRequest, res: Response) => void
);

// ── Inspeções ─────────────────────────────────────────────────────────────────
router.post(
  '/inspections',
  auth, inspectorOnly,
  validate(startInspectionSchema),
  inspectionController.start as (req: AuthenticatedRequest, res: Response) => void
);

router.patch(
  '/inspections/:id/floors/:floorId',
  auth, inspectorOnly,
  validate(floorFormSchema),
  inspectionController.saveFloorForm as (req: AuthenticatedRequest, res: Response) => void
);

router.post(
  '/inspections/:id/finish',
  auth, inspectorOnly,
  inspectionController.finish as (req: AuthenticatedRequest, res: Response) => void
);

router.get(
  '/inspections',
  auth, anyRole,
  inspectionController.findAll as (req: AuthenticatedRequest, res: Response) => void
);

router.get(
  '/inspections/:id',
  auth, anyRole,
  inspectionController.findById as (req: AuthenticatedRequest, res: Response) => void
);

router.get(
  '/inspections/:id/excel',
  auth, anyRole,
  inspectionController.getExcelUrl as (req: AuthenticatedRequest, res: Response) => void
);

router.post(
  '/inspections/:id/sync-google-form',
  auth, inspectorOnly,
  inspectionController.syncGoogleForms as (req: AuthenticatedRequest, res: Response) => void
);

// ── Calendário ────────────────────────────────────────────────────────────────
router.get(
  '/calendar',
  auth, anyRole,
  inspectionController.getCalendar as (req: AuthenticatedRequest, res: Response) => void
);

export default router;
