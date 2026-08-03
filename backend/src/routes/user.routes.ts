import { Router, Request, Response, NextFunction } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, AuthenticatedRequest } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  changePasswordSchema,
} from '../validators/auth.validator';

const router = Router();

// Todas as rotas de /users requerem autenticação
router.use(authenticate as (req: Request, res: Response, next: NextFunction) => void);

// ADMIN only
router.post(
  '/',
  authorize('ADMIN') as (req: AuthenticatedRequest, res: Response, next: NextFunction) => void,
  validate(createUserSchema),
  userController.create as (req: AuthenticatedRequest, res: Response) => void
);

router.get(
  '/',
  authorize('ADMIN') as (req: AuthenticatedRequest, res: Response, next: NextFunction) => void,
  userController.findAll as (req: AuthenticatedRequest, res: Response) => void
);

router.patch(
  '/:id',
  authorize('ADMIN') as (req: AuthenticatedRequest, res: Response, next: NextFunction) => void,
  validate(updateUserSchema),
  userController.update as (req: AuthenticatedRequest, res: Response) => void
);

// Rotas do próprio usuário
router.get('/me', userController.getMe as (req: AuthenticatedRequest, res: Response) => void);
router.patch('/me', validate(updateMeSchema), userController.updateMe as (req: AuthenticatedRequest, res: Response) => void);
router.patch('/me/password', validate(changePasswordSchema), userController.changePassword as (req: AuthenticatedRequest, res: Response) => void);
router.delete('/me', userController.deleteMe as (req: AuthenticatedRequest, res: Response) => void);

export default router;
