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

const auth = authenticate as any;
const adminOnly = authorize('ADMIN') as any;
// Administração do prédio (edição, andares, membros, solicitações).
//
// Não existe mais um `authorize(...)` na frente destas rotas: com o papel vindo
// do vínculo, `users.role` não tem nada a dizer sobre prédio. Um guarda por
// papel global aqui rejeitaria todo gestor antes de o vínculo ser consultado.
const manager = requireBuildingManager() as any;
// Leitura de dados do prédio exige vínculo (o gestor é membro do próprio prédio)
const member = requireBuildingMember() as any;

// ── Listagens (antes de qualquer rota com :id) ────────────────────────────────
router.get('/', auth, adminOnly, buildingController.findAll as any);
// Painel do admin: números do sistema inteiro
router.get('/stats', auth, adminOnly, buildingController.getStats as any);
// Tela inicial do gestor: os prédios em que ele é GESTOR
router.get('/managed', auth, buildingController.managedBuildings as any);
router.get('/me', auth, buildingController.myBuildings as any);
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
  buildingController.lookupByKey as any
);

// ── CRUD ──────────────────────────────────────────────────────────────────────
// Criar prédio é aberto a qualquer conta: quem cria vira o GESTOR dele, no mesmo
// gesto. É isso que acaba com o prédio sem gestor — antes o ADMIN podia criar um
// e deixá-lo sem dono, e o gestor precisava ser promovido antes de existir prédio.
router.post('/', auth, validate(createBuildingSchema), buildingController.create as any);
router.patch('/:id', auth, manager, validate(updateBuildingSchema), buildingController.update as any);
router.delete('/:id', auth, manager, buildingController.remove as any);

// ── Andares ───────────────────────────────────────────────────────────────────
router.get('/:id/floors', auth, member, buildingController.getFloors as any);
router.post('/:id/floors', auth, manager, validate(createFloorSchema), buildingController.createFloor as any);
router.delete('/:id/floors/:floorId', auth, manager, buildingController.deleteFloor as any);

// ── Dashboard e histórico ─────────────────────────────────────────────────────
router.get('/:id/dashboard', auth, member, buildingController.getDashboard as any);
router.get('/:id/history', auth, member, buildingController.getHistory as any);

// ── Gestores ──────────────────────────────────────────────────────────────────
// Adicionar outro gestor é o que permite dividir ou passar a gestão adiante:
// quem quer sair adiciona o substituto e depois se remove. A saída do último é
// recusada com 409.
router.post('/:id/managers', auth, manager, buildingController.addManager as any);
router.delete('/:id/managers/:managerId', auth, manager, buildingController.removeManager as any);

// ── Membros ───────────────────────────────────────────────────────────────────
router.get('/:id/members', auth, manager, buildingController.getMembers as any);
router.delete('/:id/members/me', auth, buildingController.leaveBuilding as any);
router.patch(
  '/:id/members/:userId',
  auth,
  manager,
  validate(updateMemberRoleSchema),
  buildingController.updateMemberRole as any
);
router.delete('/:id/members/:userId', auth, manager, buildingController.removeMember as any);

// ── Solicitações de acesso ────────────────────────────────────────────────────
// Vínculo é feito pela chave de compartilhamento, nunca pelo id do prédio
router.post(
  '/access-requests',
  auth,
  sensitiveLimiter,
  validate(accessRequestSchema),
  buildingController.requestAccess as any
);
router.get('/:id/access-requests', auth, manager, buildingController.getAccessRequests as any);
router.patch(
  '/:id/access-requests/:requestId',
  auth,
  manager,
  validate(reviewAccessRequestSchema),
  buildingController.reviewAccessRequest as any
);

export default router;
