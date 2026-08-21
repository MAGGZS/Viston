import { Router } from 'express';
import { ticketController } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireBuildingMember, requireBuildingModerator } from '../middlewares/buildingAccess';

const router = Router();

const auth = authenticate;
const moderator = requireBuildingModerator();
const member = requireBuildingMember();

// ── Os chamados do prédio ─────────────────────────────────────────────────────
// A listagem é de membro: o histórico de ocorrências do prédio é leitura livre
// de quem está vinculado a ele, e é a mesma consulta que serve à fila do
// moderador. Ler não move nada — encaminhar, receber, atualizar e fechar
// continuam checados um a um no serviço, pelo papel de quem pede.
router.get('/buildings/:id/tickets', auth, member, ticketController.findByBuilding);
// Os contadores continuam do moderador: são o painel de trabalho dele.
router.get('/buildings/:id/tickets/stats', auth, moderator, ticketController.stats);

// A lista de responsáveis é de vínculo, não de moderação: quem vistoria precisa
// dela para preencher o formulário.
router.get('/buildings/:id/responsibles', auth, member, ticketController.responsibles);

// ── O chamado, um a um ────────────────────────────────────────────────────────
// Sem guarda de papel na rota: quem pode mexer depende do prédio do chamado, e
// só o serviço sabe qual é depois de carregá-lo (ver services/ticket.service.ts).
router.get('/tickets/me', auth, ticketController.mine);
router.post('/tickets/:id/forward', auth, ticketController.forward);
router.patch('/tickets/:id', auth, ticketController.update);
// O responsável confirma o recebimento — encaminhar não começa mais o trabalho.
router.post('/tickets/:id/receive', auth, ticketController.receive);
// O responsável avisa que terminou; fechar é outra rota, de outra pessoa.
router.post('/tickets/:id/done', auth, ticketController.reportDone);
router.post('/tickets/:id/close', auth, ticketController.close);

export default router;
