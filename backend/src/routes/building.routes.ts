import { Router } from 'express';
import { buildingController } from '../controllers/building.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

const auth = authenticate as any;
const adminOnly = authorize('ADMIN') as any;
const anyRole = authorize('ADMIN', 'INSPECTOR', 'VIEWER') as any;

// ── CRUD (admin) ──────────────────────────────────────────────────────────────
router.get('/', auth, adminOnly, buildingController.findAll as any);
router.get('/me', auth, anyRole, buildingController.myBuildings as any);
router.post('/', auth, adminOnly, buildingController.create as any);
router.patch('/:id', auth, adminOnly, buildingController.update as any);
router.delete('/:id', auth, adminOnly, buildingController.remove as any);

// ── Andares ───────────────────────────────────────────────────────────────────
router.get('/:id/floors', auth, anyRole, buildingController.getFloors as any);
router.post('/:id/floors', auth, adminOnly, buildingController.createFloor as any);
router.delete('/:id/floors/:floorId', auth, adminOnly, buildingController.deleteFloor as any);

// ── Dashboard e histórico ─────────────────────────────────────────────────────
router.get('/:id/dashboard', auth, anyRole, buildingController.getDashboard as any);
router.get('/:id/history', auth, anyRole, buildingController.getHistory as any);

// ── Membros ───────────────────────────────────────────────────────────────────
router.get('/:id/members', auth, adminOnly, buildingController.getMembers as any);
router.delete('/:id/members/:userId', auth, adminOnly, buildingController.removeMember as any);

// ── Solicitações de acesso ────────────────────────────────────────────────────
router.post('/:id/access-requests', auth, anyRole, buildingController.requestAccess as any);
router.get('/:id/access-requests', auth, adminOnly, buildingController.getAccessRequests as any);
router.patch('/:id/access-requests/:requestId', auth, adminOnly, buildingController.reviewAccessRequest as any);

export default router;
