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
// Os gráficos do painel — mesma leitura dos contadores, partida por estado e
// por categoria dentro de um período. De moderador pelo mesmo motivo que eles.
router.get('/buildings/:id/tickets/summary', auth, moderator, ticketController.summary);
// O relatório do período, em .docx. De moderador: é o consolidado do trabalho
// dele, com gasto de manutenção dentro, e não leitura de quem só acompanha.
router.get('/buildings/:id/tickets/report', auth, moderator, ticketController.report);

// A lista de responsáveis é de vínculo, não de moderação: quem vistoria precisa
// dela para preencher o formulário.
router.get('/buildings/:id/responsibles', auth, member, ticketController.responsibles);

// ── O chamado, um a um ────────────────────────────────────────────────────────
// Sem guarda de papel na rota: quem pode mexer depende do prédio do chamado, e
// só o serviço sabe qual é depois de carregá-lo (ver services/ticket.service.ts).
router.get('/tickets/me', auth, ticketController.mine);
// Depois de `/tickets/me`, e a ordem é o que faz as duas conviverem: declarado
// antes, o segmento variável engoliria "me" e a lista do responsável viraria
// uma busca por um chamado de id "me".
router.get('/tickets/:id', auth, ticketController.findOne);
router.post('/tickets/:id/forward', auth, ticketController.forward);
// Cancelar o envio: o oposto de encaminhar, e só enquanto ninguém aceitou.
router.post('/tickets/:id/unforward', auth, ticketController.unforward);
router.patch('/tickets/:id', auth, ticketController.update);
// O responsável confirma o recebimento — encaminhar não começa mais o trabalho.
router.post('/tickets/:id/receive', auth, ticketController.receive);
// O responsável avisa que terminou; fechar é outra rota, de outra pessoa.
router.post('/tickets/:id/done', auth, ticketController.reportDone);
router.post('/tickets/:id/close', auth, ticketController.close);

// ── A linha do tempo da manutenção ───────────────────────────────────────────
// Ler é de quem enxerga o chamado; escrever é do responsável dele ou do
// moderador do prédio — e alterar, só da última linha e de quem a escreveu.
// Tudo conferido no serviço, pelo mesmo motivo das rotas acima.
router.get('/tickets/:id/updates', auth, ticketController.listUpdates);
router.post('/tickets/:id/updates', auth, ticketController.addUpdate);
router.patch('/tickets/:id/updates/:updateId', auth, ticketController.editUpdate);
router.delete('/tickets/:id/updates/:updateId', auth, ticketController.removeUpdate);

export default router;
