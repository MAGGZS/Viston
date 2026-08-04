import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  changePasswordSchema,
} from '../validators/auth.validator';

const router = Router();

// Cadastro público — primeiro usuário vira ADMIN, demais entram como VIEWER
// O campo role no body é ignorado (definido automaticamente pelo service)
router.post('/', validate(createUserSchema), userController.create as any);

// Rotas protegidas
router.get('/', authenticate as any, authorize('ADMIN') as any, userController.findAll as any);
router.patch('/:id', authenticate as any, authorize('ADMIN') as any, validate(updateUserSchema), userController.update as any);

// Próprio usuário
router.get('/me', authenticate as any, userController.getMe as any);
router.patch('/me', authenticate as any, validate(updateMeSchema), userController.updateMe as any);
router.patch('/me/password', authenticate as any, validate(changePasswordSchema), userController.changePassword as any);
router.delete('/me', authenticate as any, userController.deleteMe as any);

export default router;
