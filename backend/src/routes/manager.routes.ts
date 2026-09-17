import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
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

const router = guardUuidParams(Router());

const auth = authenticate;
const adminOnly = authorize('ADMIN');

// Cadastro público de gestor. A conta nasce em `managers`, e já pode cadastrar
// prédio — cada prédio que ela cadastrar tem ela como gestora.
router.post('/', sensitiveLimiter, validate(createUserSchema), managerController.create);

// Conta própria — antes de /:id para não ser capturado pelo parâmetro dinâmico.
// O perfil é lido por GET /auth/me, que serve os dois tipos de conta.
router.patch('/me', auth, validate(updateMeSchema), managerController.updateMe);
router.patch('/me/password', auth, validate(changePasswordSchema), managerController.changePassword);
router.patch('/me/avatar', auth, validate(updateAvatarSchema), managerController.updateAvatar);
router.delete('/me/avatar', auth, managerController.removeAvatar);
router.delete('/me', auth, managerController.deleteMe);

// Painel do admin
router.get('/', auth, adminOnly, managerController.findAll);
router.delete('/:id', auth, adminOnly, managerController.remove);

export default router;
