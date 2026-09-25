import { Router } from 'express';
import { guardUuidParams } from '../middlewares/uuidParams';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { authEmailLimiter, authIpLimiter, authLimiter } from '../middlewares/rateLimit';
import { loginSchema, refreshSchema } from '../validators/auth.validator';
import {
  confirmEmailSchema,
  forgotPasswordSchema,
  resendConfirmationSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} from '../validators/confirmation.validator';

const router = guardUuidParams(Router());
const authGuards = [authIpLimiter, authEmailLimiter, authLimiter];

router.post('/login', ...authGuards, validate(loginSchema), authController.login);
router.post('/refresh', authIpLimiter, authLimiter, validate(refreshSchema), authController.refresh);

// Confirmação de e-mail e recuperação de senha. Todas públicas por natureza:
// quem chama não tem acesso ainda, ou perdeu o que tinha.
//
// `authGuards` combina teto por IP puro, por e-mail puro e pelo par IP+e-mail
// (SEC-07). Dentro do serviço ainda valem o intervalo de 60s entre pedidos, o
// teto de 5 por hora por endereço e o de 5 chutes por código.
router.post('/confirmar', ...authGuards, validate(confirmEmailSchema), authController.confirmar);
router.post('/reenviar', ...authGuards, validate(resendConfirmationSchema), authController.reenviar);

router.post('/senha/esqueci', ...authGuards, validate(forgotPasswordSchema), authController.esqueciSenha);
router.post('/senha/verificar', ...authGuards, validate(verifyResetCodeSchema), authController.verificarCodigoSenha);
router.post('/senha/redefinir', ...authGuards, validate(resetPasswordSchema), authController.redefinirSenha);

// Perfil de quem está logado, qualquer que seja o tipo da conta
router.get('/me', authenticate, authController.me);
// Sair: derruba os refresh tokens da conta e grava LOGOUT na trilha. Autenticada
// de propósito — sem saber quem é, não há geração de sessão para incrementar.
router.post('/logout', authenticate, authController.logout);

export default router;
