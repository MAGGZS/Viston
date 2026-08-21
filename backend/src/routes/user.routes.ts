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

// Cadastro público (nasce sem nível de acesso — ver user.service)
router.post('/', sensitiveLimiter, validate(createUserSchema), userController.create);
// Cadastro de gestor não mora aqui: gestor é outro tipo de conta, e a rota é
// POST /managers (ver routes/manager.routes.ts).

// Próprio usuário — deve vir ANTES de /:id para não ser capturado pelo parâmetro dinâmico
router.get('/me', authenticate, userController.getMe);
router.patch('/me', authenticate, validate(updateMeSchema), userController.updateMe);
router.patch('/me/password', authenticate, validate(changePasswordSchema), userController.changePassword);
// Foto de perfil — a imagem chega já recortada pelo app, como data URL.
// PATCH e não PUT: a lista de métodos liberados no CORS (ver app.ts) é uma
// permissão explícita, e a API inteira vive de PATCH.
router.patch('/me/avatar', authenticate, validate(updateAvatarSchema), userController.updateAvatar);
router.delete('/me/avatar', authenticate, userController.removeAvatar);
router.delete('/me', authenticate, userController.deleteMe);

// Rotas admin — /:id depois das rotas fixas
router.get('/', authenticate, authorize('ADMIN'), userController.findAll);
router.patch('/:id', authenticate, authorize('ADMIN'), validate(updateUserSchema), userController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), userController.remove);

export default router;
