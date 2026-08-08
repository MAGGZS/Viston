import { Router } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

const adminOnly = authorize('ADMIN') as any;
const inspectorOnly = authorize('ADMIN', 'INSPECTOR') as any;
const anyRole = authorize('ADMIN', 'INSPECTOR', 'VIEWER') as any;
const auth = authenticate as any;

// ── Buildings ─────────────────────────────────────────────────────────────────
router.get('/buildings/:id/floors', auth, anyRole, inspectionController.getFloors as any);

// ── Inspeções ─────────────────────────────────────────────────────────────────
// Envio único: a vistoria inteira chega de uma vez, já concluída
router.post('/inspections', auth, inspectorOnly, inspectionController.submit as any);
router.get('/inspections', auth, anyRole, inspectionController.findAll as any);
router.get('/inspections/:id', auth, anyRole, inspectionController.findById as any);
// Descarte da vistoria: só ADMIN
router.delete('/inspections/:id', auth, adminOnly, inspectionController.remove as any);
router.get('/inspections/:id/excel', auth, anyRole, inspectionController.getExcelUrl as any);
// Refaz a planilha quando o upload falhou no envio
router.post('/inspections/:id/excel', auth, inspectorOnly, inspectionController.generateExcel as any);

// ── Calendário ────────────────────────────────────────────────────────────────
router.get('/calendar', auth, anyRole, inspectionController.getCalendar as any);

export default router;
