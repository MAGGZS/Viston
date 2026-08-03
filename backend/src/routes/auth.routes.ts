import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { loginSchema, refreshSchema } from '../validators/auth.validator';

const router = Router();

router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshSchema), authController.refresh);

export default router;
