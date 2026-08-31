import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';
import { authLimiter } from '../middlewares/rateLimit';
import { loginSchema, refreshSchema } from '../validators/auth.validator';
import {
  confirmEmailSchema,
  forgotPasswordSchema,
  resendConfirmationSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} from '../validators/confirmation.validator';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);

// Confirmação de e-mail e recuperação de senha. Todas públicas por natureza:
// quem chama não tem acesso ainda, ou perdeu o que tinha.
//
// `authLimiter` e não `sensitiveLimiter` porque as cinco são alvo de tentativa
// em série — adivinhar código, disparar e-mail. Todas mandam `email` no corpo,
// e a cota dele é por IP *e* conta, que é a forma certa de limitar quem insiste
// numa conta só. Dentro do serviço ainda valem o intervalo de 60s entre
// pedidos, o teto de 5 por hora por endereço e o de 5 chutes por código.
router.post('/confirmar', authLimiter, validate(confirmEmailSchema), authController.confirmar);
router.post('/reenviar', authLimiter, validate(resendConfirmationSchema), authController.reenviar);

router.post('/senha/esqueci', authLimiter, validate(forgotPasswordSchema), authController.esqueciSenha);
router.post('/senha/verificar', authLimiter, validate(verifyResetCodeSchema), authController.verificarCodigoSenha);
router.post('/senha/redefinir', authLimiter, validate(resetPasswordSchema), authController.redefinirSenha);

// Perfil de quem está logado, qualquer que seja o tipo da conta
router.get('/me', authenticate, authController.me);
// Sair: derruba os refresh tokens da conta e grava LOGOUT na trilha. Autenticada
// de propósito — sem saber quem é, não há geração de sessão para incrementar.
router.post('/logout', authenticate, authController.logout);

export default router;
