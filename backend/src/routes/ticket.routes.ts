import { Router } from 'express';
import { ticketController } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireBuildingMember, requireBuildingModerator } from '../middlewares/buildingAccess';

const router = Router();

const auth = authenticate as any;
const moderator = requireBuildingModerator() as any;
const member = requireBuildingMember() as any;

// ── A fila do moderador ───────────────────────────────────────────────────────
// Guardadas por `requireBuildingModerator`: quem só acompanha o prédio não vê a
// fila de chamados dele.
router.get('/buildings/:id/tickets', auth, moderator, ticketController.findByBuilding as any);
router.get('/buildings/:id/tickets/stats', auth, moderator, ticketController.stats as any);

// A lista de responsáveis é de vínculo, não de moderação: quem vistoria precisa
// dela para preencher o formulário.
router.get('/buildings/:id/responsibles', auth, member, ticketController.responsibles as any);

// ── O chamado, um a um ────────────────────────────────────────────────────────
// Sem guarda de papel na rota: quem pode mexer depende do prédio do chamado, e
// só o serviço sabe qual é depois de carregá-lo (ver services/ticket.service.ts).
router.get('/tickets/me', auth, ticketController.mine as any);
router.post('/tickets/:id/forward', auth, ticketController.forward as any);
router.patch('/tickets/:id', auth, ticketController.update as any);
// O responsável avisa que terminou; fechar é outra rota, de outra pessoa.
router.post('/tickets/:id/done', auth, ticketController.reportDone as any);
router.post('/tickets/:id/close', auth, ticketController.close as any);

export default router;
