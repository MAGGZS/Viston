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

router.use(authenticate as any);

// ADMIN only
router.post('/', authorize('ADMIN') as any, validate(createUserSchema), userController.create as any);
router.get('/', authorize('ADMIN') as any, userController.findAll as any);
router.patch('/:id', authorize('ADMIN') as any, validate(updateUserSchema), userController.update as any);

// Próprio usuário
router.get('/me', userController.getMe as any);
router.patch('/me', validate(updateMeSchema), userController.updateMe as any);
router.patch('/me/password', validate(changePasswordSchema), userController.changePassword as any);
router.delete('/me', userController.deleteMe as any);

export default router;
