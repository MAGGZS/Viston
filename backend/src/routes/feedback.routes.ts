import { Router } from 'express';
import { feedbackController } from '../controllers/feedback.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import {
  createFeedbackSchema,
  updateFeedbackSchema,
  listFeedbackQuerySchema,
} from '../validators/feedback.validator';

const router = Router();

const auth = authenticate as any;
const adminOnly = authorize('ADMIN') as any;

// ── Quem manda ────────────────────────────────────────────────────────────────
// Qualquer conta autenticada, das duas naturezas, quantas vezes quiser. O teto
// por IP é o mesmo do cadastro público — segura enxurrada sem atrapalhar quem
// tem duas coisas a dizer no mesmo dia.
router.post('/', auth, sensitiveLimiter, validate(createFeedbackSchema), feedbackController.create as any);

// Os próprios envios — antes de /:id para não cair no parâmetro dinâmico
router.get('/me', auth, feedbackController.listMine as any);

// ── A caixa do admin ─────────────────────────────────────────────────────────
router.get('/', auth, adminOnly, validate(listFeedbackQuerySchema, 'query'), feedbackController.findAll as any);
router.patch('/:id', auth, adminOnly, validate(updateFeedbackSchema), feedbackController.review as any);
// Descartar é apagar: o feedback não volta de lugar nenhum.
router.delete('/:id', auth, adminOnly, feedbackController.discard as any);

export default router;
