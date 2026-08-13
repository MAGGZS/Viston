import { Router } from 'express';
import { managerController } from '../controllers/manager.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import {
  createUserSchema,
  updateMeSchema,
  updateAvatarSchema,
  changePasswordSchema,
} from '../validators/auth.validator';

const router = Router();

const auth = authenticate as any;
const adminOnly = authorize('ADMIN') as any;

// Cadastro público de gestor. A conta nasce em `managers`, e já pode cadastrar
// prédio — cada prédio que ela cadastrar tem ela como gestora.
router.post('/', sensitiveLimiter, validate(createUserSchema), managerController.create as any);

// Conta própria — antes de /:id para não ser capturado pelo parâmetro dinâmico
router.get('/me', auth, managerController.getMe as any);
router.patch('/me', auth, validate(updateMeSchema), managerController.updateMe as any);
router.patch('/me/password', auth, validate(changePasswordSchema), managerController.changePassword as any);
router.patch('/me/avatar', auth, validate(updateAvatarSchema), managerController.updateAvatar as any);
router.delete('/me/avatar', auth, managerController.removeAvatar as any);
router.delete('/me', auth, managerController.deleteMe as any);

// Painel do admin
router.get('/', auth, adminOnly, managerController.findAll as any);
router.delete('/:id', auth, adminOnly, managerController.remove as any);

export default router;
