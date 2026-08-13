import { Router } from 'express';
import { inspectionController } from '../controllers/inspection.controller';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

const auth = authenticate as any;

// Nenhuma destas rotas tem guarda por papel global: quem pode vistoriar,
// descartar ou ler um relatório depende do prédio dele, e isso o serviço
// resolve consultando o vínculo (ver services/inspection.service.ts).
//
// As listagens já saem filtradas pelos prédios do usuário — quem não tem
// vínculo nenhum recebe uma lista vazia, não um 403.

// ── Inspeções ─────────────────────────────────────────────────────────────────
// Envio único: a vistoria inteira chega de uma vez, já concluída
router.post('/inspections', auth, inspectionController.submit as any);
router.get('/inspections', auth, inspectionController.findAll as any);
router.get('/inspections/:id', auth, inspectionController.findById as any);
// Descarte da vistoria: só o gestor do prédio
router.delete('/inspections/:id', auth, inspectionController.remove as any);
router.get('/inspections/:id/excel', auth, inspectionController.getExcelUrl as any);
// Refaz a planilha quando o upload falhou no envio
router.post('/inspections/:id/excel', auth, inspectionController.generateExcel as any);

// ── Calendário ────────────────────────────────────────────────────────────────
router.get('/calendar', auth, inspectionController.getCalendar as any);

export default router;
