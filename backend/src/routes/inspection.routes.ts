import { Router } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

// Descarte da vistoria: quem administra o prédio (a posse é conferida no serviço)
const managerRoles = authorize('ADMIN', 'GESTOR') as any;
const inspectorOnly = authorize('ADMIN', 'GESTOR', 'INSPECTOR') as any;
// Inclui NONE: a conta sem vínculo abre o histórico e o calendário, que já
// vêm vazios porque a listagem é filtrada pelos prédios do usuário.
const anyRole = authorize('ADMIN', 'GESTOR', 'INSPECTOR', 'VIEWER', 'NONE') as any;
const auth = authenticate as any;

// ── Inspeções ─────────────────────────────────────────────────────────────────
// Envio único: a vistoria inteira chega de uma vez, já concluída
router.post('/inspections', auth, inspectorOnly, inspectionController.submit as any);
router.get('/inspections', auth, anyRole, inspectionController.findAll as any);
router.get('/inspections/:id', auth, anyRole, inspectionController.findById as any);
// Descarte da vistoria: só o gestor do prédio
router.delete('/inspections/:id', auth, managerRoles, inspectionController.remove as any);
router.get('/inspections/:id/excel', auth, anyRole, inspectionController.getExcelUrl as any);
// Refaz a planilha quando o upload falhou no envio
router.post('/inspections/:id/excel', auth, inspectorOnly, inspectionController.generateExcel as any);

// ── Calendário ────────────────────────────────────────────────────────────────
router.get('/calendar', auth, anyRole, inspectionController.getCalendar as any);

export default router;
