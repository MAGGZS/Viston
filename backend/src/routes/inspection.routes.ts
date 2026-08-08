import { Router } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { startInspectionSchema, floorFormSchema } from '../validators/inspection.validator';

const router = Router();

const inspectorOnly = authorize('ADMIN', 'INSPECTOR') as any;
const anyRole = authorize('ADMIN', 'INSPECTOR', 'VIEWER') as any;
const auth = authenticate as any;

// ── Buildings ─────────────────────────────────────────────────────────────────
router.get('/buildings/:id/floors', auth, anyRole, inspectionController.getFloors as any);

// ── Inspeções ─────────────────────────────────────────────────────────────────
router.post('/inspections', auth, inspectorOnly, validate(startInspectionSchema), inspectionController.start as any);
router.patch('/inspections/:id/floors/:floorId', auth, inspectorOnly, validate(floorFormSchema), inspectionController.saveFloorForm as any);
router.post('/inspections/:id/finish', auth, inspectorOnly, inspectionController.finish as any);
router.get('/inspections', auth, anyRole, inspectionController.findAll as any);
router.get('/inspections/:id', auth, anyRole, inspectionController.findById as any);
router.get('/inspections/:id/excel', auth, anyRole, inspectionController.getExcelUrl as any);

// ── Calendário ────────────────────────────────────────────────────────────────
router.get('/calendar', auth, anyRole, inspectionController.getCalendar as any);

export default router;
