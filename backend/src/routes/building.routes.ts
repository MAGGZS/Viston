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
// Quem pode ser dono de prédio. Só ser GESTOR não basta: as rotas com :id ainda
// passam por `manager`, que exige ser o gestor daquele prédio.
const managerRoles = authorize('ADMIN', 'GESTOR') as any;
// Qualquer conta autenticada, inclusive a que ainda não tem nível de acesso
// (NONE): é por aqui que ela consulta a chave e pede vínculo. O que exige
// prédio continua barrado por `member`/`manager`, que conferem o vínculo real.
const anyRole = authorize('ADMIN', 'GESTOR', 'INSPECTOR', 'VIEWER', 'NONE') as any;
// Administração do prédio (edição, andares, membros, solicitações)
const manager = requireBuildingManager() as any;
// Leitura de dados do prédio exige vínculo (quem administra passa direto)
const member = requireBuildingMember() as any;

// ── Listagens (antes de qualquer rota com :id) ────────────────────────────────
router.get('/', auth, adminOnly, buildingController.findAll as any);
// Painel do admin: números do sistema inteiro
router.get('/stats', auth, adminOnly, buildingController.getStats as any);
// Tela inicial do gestor: os prédios que ele criou
router.get('/managed', auth, managerRoles, buildingController.managedBuildings as any);
router.get('/me', auth, anyRole, buildingController.myBuildings as any);
// Busca por chave de compartilhamento
router.get('/lookup', auth, anyRole, sensitiveLimiter, buildingController.lookupByKey as any);

// ── CRUD (gestor do prédio) ───────────────────────────────────────────────────
router.post('/', auth, managerRoles, validate(createBuildingSchema), buildingController.create as any);
router.patch('/:id', auth, managerRoles, manager, validate(updateBuildingSchema), buildingController.update as any);
router.delete('/:id', auth, managerRoles, manager, buildingController.remove as any);

// ── Andares ───────────────────────────────────────────────────────────────────
router.get('/:id/floors', auth, anyRole, member, buildingController.getFloors as any);
router.post('/:id/floors', auth, managerRoles, manager, validate(createFloorSchema), buildingController.createFloor as any);
router.delete('/:id/floors/:floorId', auth, managerRoles, manager, buildingController.deleteFloor as any);

// ── Dashboard e histórico ─────────────────────────────────────────────────────
router.get('/:id/dashboard', auth, anyRole, member, buildingController.getDashboard as any);
router.get('/:id/history', auth, anyRole, member, buildingController.getHistory as any);

// ── Membros ───────────────────────────────────────────────────────────────────
router.get('/:id/members', auth, managerRoles, manager, buildingController.getMembers as any);
router.delete('/:id/members/me', auth, anyRole, buildingController.leaveBuilding as any);
router.patch(
  '/:id/members/:userId',
  auth,
  managerRoles,
  manager,
  validate(updateMemberRoleSchema),
  buildingController.updateMemberRole as any
);
router.delete('/:id/members/:userId', auth, managerRoles, manager, buildingController.removeMember as any);

// ── Solicitações de acesso ────────────────────────────────────────────────────
// Vínculo é feito pela chave de compartilhamento, nunca pelo id do prédio
router.post(
  '/access-requests',
  auth,
  anyRole,
  sensitiveLimiter,
  validate(accessRequestSchema),
  buildingController.requestAccess as any
);
router.get('/:id/access-requests', auth, managerRoles, manager, buildingController.getAccessRequests as any);
router.patch(
  '/:id/access-requests/:requestId',
  auth,
  managerRoles,
  manager,
  validate(reviewAccessRequestSchema),
  buildingController.reviewAccessRequest as any
);

export default router;
