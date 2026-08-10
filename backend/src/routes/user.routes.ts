import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { sensitiveLimiter } from '../middlewares/rateLimit';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  updateAvatarSchema,
  changePasswordSchema,
} from '../validators/auth.validator';

const router = Router();

// Cadastro público (papel sai sempre como VIEWER — ver user.service)
router.post('/', sensitiveLimiter, validate(createUserSchema), userController.create as any);
// Cadastro público de gestor — mesma validação, papel decidido pela rota
router.post('/managers', sensitiveLimiter, validate(createUserSchema), userController.createManager as any);

// Próprio usuário — deve vir ANTES de /:id para não ser capturado pelo parâmetro dinâmico
router.get('/me', authenticate as any, userController.getMe as any);
router.patch('/me', authenticate as any, validate(updateMeSchema), userController.updateMe as any);
router.patch('/me/password', authenticate as any, validate(changePasswordSchema), userController.changePassword as any);
// Foto de perfil — a imagem chega já recortada pelo app, como data URL.
// PATCH e não PUT: a lista de métodos liberados no CORS (ver app.ts) é uma
// permissão explícita, e a API inteira vive de PATCH.
router.patch('/me/avatar', authenticate as any, validate(updateAvatarSchema), userController.updateAvatar as any);
router.delete('/me/avatar', authenticate as any, userController.removeAvatar as any);
router.delete('/me', authenticate as any, userController.deleteMe as any);

// Rotas admin — /:id depois das rotas fixas
router.get('/', authenticate as any, authorize('ADMIN') as any, userController.findAll as any);
router.patch('/:id', authenticate as any, authorize('ADMIN') as any, validate(updateUserSchema), userController.update as any);
router.delete('/:id', authenticate as any, authorize('ADMIN') as any, userController.remove as any);

export default router;
