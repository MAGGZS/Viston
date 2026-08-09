import { Router } from 'express';
import { buildingController } from '../controllers/building.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { requireBuildingMember } from '../middlewares/buildingAccess';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import {
  accessRequestSchema,
  createBuildingSchema,
  createFloorSchema,
  reviewAccessRequestSchema,
  updateBuildingSchema,
} from '../validators/auth.validator';

const router = Router();

const auth = authenticate as any;
const adminOnly = authorize('ADMIN') as any;
const anyRole = authorize('ADMIN', 'INSPECTOR', 'VIEWER') as any;
// Leitura de dados do prédio exige vínculo (ADMIN passa direto)
const member = requireBuildingMember() as any;

// ── CRUD (admin) ──────────────────────────────────────────────────────────────
router.get('/', auth, adminOnly, buildingController.findAll as any);
router.get('/me', auth, anyRole, buildingController.myBuildings as any);
// Busca por chave de compartilhamento (antes de qualquer rota com :id)
router.get('/lookup', auth, anyRole, sensitiveLimiter, buildingController.lookupByKey as any);
router.post('/', auth, adminOnly, validate(createBuildingSchema), buildingController.create as any);
router.patch('/:id', auth, adminOnly, validate(updateBuildingSchema), buildingController.update as any);
router.delete('/:id', auth, adminOnly, buildingController.remove as any);

// ── Andares ───────────────────────────────────────────────────────────────────
router.get('/:id/floors', auth, anyRole, member, buildingController.getFloors as any);
router.post('/:id/floors', auth, adminOnly, validate(createFloorSchema), buildingController.createFloor as any);
router.delete('/:id/floors/:floorId', auth, adminOnly, buildingController.deleteFloor as any);

// ── Dashboard e histórico ─────────────────────────────────────────────────────
router.get('/:id/dashboard', auth, anyRole, member, buildingController.getDashboard as any);
router.get('/:id/history', auth, anyRole, member, buildingController.getHistory as any);

// ── Membros ───────────────────────────────────────────────────────────────────
router.get('/:id/members', auth, adminOnly, buildingController.getMembers as any);
router.delete('/:id/members/me', auth, anyRole, buildingController.leaveBuilding as any);
router.delete('/:id/members/:userId', auth, adminOnly, buildingController.removeMember as any);

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
router.get('/:id/access-requests', auth, adminOnly, buildingController.getAccessRequests as any);
router.patch(
  '/:id/access-requests/:requestId',
  auth,
  adminOnly,
  validate(reviewAccessRequestSchema),
  buildingController.reviewAccessRequest as any
);

export default router;
