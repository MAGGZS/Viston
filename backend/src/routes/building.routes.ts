import { Router } from 'express';
import { buildingController } from '../controllers/building.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { requireBuildingManager, requireBuildingMember } from '../middlewares/buildingAccess';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import {
  accessRequestSchema,
  createBuildingSchema,
  createFloorSchema,
  reviewAccessRequestSchema,
  updateBuildingSchema,
  updateMemberRoleSchema,
} from '../validators/auth.validator';

const router = Router();

const auth = authenticate;
const adminOnly = authorize('ADMIN');
// Administração do prédio (edição, andares, membros, solicitações).
//
// Não existe mais um `authorize(...)` na frente destas rotas: com o papel vindo
// do vínculo, `users.role` não tem nada a dizer sobre prédio. Um guarda por
// papel global aqui rejeitaria todo gestor antes de o vínculo ser consultado.
const manager = requireBuildingManager();
// Leitura de dados do prédio exige vínculo (o gestor é membro do próprio prédio)
const member = requireBuildingMember();

// ── Listagens (antes de qualquer rota com :id) ────────────────────────────────
router.get('/', auth, adminOnly, buildingController.findAll);
// Painel do admin: números do sistema inteiro
router.get('/stats', auth, adminOnly, buildingController.getStats);
// Tela inicial do gestor: os prédios em que ele é GESTOR
router.get('/managed', auth, buildingController.managedBuildings);
router.get('/me', auth, buildingController.myBuildings);
// Busca por chave de compartilhamento.
//
// POST numa consulta é incomum, e é de propósito: a chave vai no corpo porque
// querystring é registrada em log de acesso, em proxy e no histórico do
// navegador — ver o comentário no controller.
router.post(
  '/lookup',
  auth,
  sensitiveLimiter,
  validate(accessRequestSchema),
  buildingController.lookupByKey
);

// ── CRUD ──────────────────────────────────────────────────────────────────────
// Criar prédio é aberto a qualquer conta: quem cria vira o GESTOR dele, no mesmo
// gesto. É isso que acaba com o prédio sem gestor — antes o ADMIN podia criar um
// e deixá-lo sem dono, e o gestor precisava ser promovido antes de existir prédio.
router.post('/', auth, validate(createBuildingSchema), buildingController.create);
router.patch('/:id', auth, manager, validate(updateBuildingSchema), buildingController.update);
router.delete('/:id', auth, manager, buildingController.remove);

// ── Andares ───────────────────────────────────────────────────────────────────
router.get('/:id/floors', auth, member, buildingController.getFloors);
router.post('/:id/floors', auth, manager, validate(createFloorSchema), buildingController.createFloor);
router.delete('/:id/floors/:floorId', auth, manager, buildingController.deleteFloor);

// ── Dashboard e histórico ─────────────────────────────────────────────────────
router.get('/:id/dashboard', auth, member, buildingController.getDashboard);
router.get('/:id/history', auth, member, buildingController.getHistory);

// ── Gestores ──────────────────────────────────────────────────────────────────
// Adicionar outro gestor é o que permite dividir ou passar a gestão adiante:
// quem quer sair adiciona o substituto e depois se remove. A saída do último é
// recusada com 409.
router.post('/:id/managers', auth, manager, buildingController.addManager);
router.delete('/:id/managers/:managerId', auth, manager, buildingController.removeManager);

// ── Membros ───────────────────────────────────────────────────────────────────
router.get('/:id/members', auth, manager, buildingController.getMembers);
router.delete('/:id/members/me', auth, buildingController.leaveBuilding);
router.patch(
  '/:id/members/:userId',
  auth,
  manager,
  validate(updateMemberRoleSchema),
  buildingController.updateMemberRole
);
router.delete('/:id/members/:userId', auth, manager, buildingController.removeMember);

// ── Solicitações de acesso ────────────────────────────────────────────────────
// Vínculo é feito pela chave de compartilhamento, nunca pelo id do prédio
router.post(
  '/access-requests',
  auth,
  sensitiveLimiter,
  validate(accessRequestSchema),
  buildingController.requestAccess
);
router.get('/:id/access-requests', auth, manager, buildingController.getAccessRequests);
router.patch(
  '/:id/access-requests/:requestId',
  auth,
  manager,
  validate(reviewAccessRequestSchema),
  buildingController.reviewAccessRequest
);

export default router;
