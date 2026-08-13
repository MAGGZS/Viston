import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { authLimiter } from '../middlewares/rateLimit';
import { loginSchema, refreshSchema } from '../validators/auth.validator';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
// Perfil de quem está logado, qualquer que seja o tipo da conta
router.get('/me', authenticate as any, authController.me as any);

export default router;
